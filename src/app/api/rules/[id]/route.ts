import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

const VALID_RULE_TYPES = ["EXCLUSION", "PREREQUISITE", "DISTRIBUTION", "CONFLICT"];

// Full update
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.schedulingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, description, ruleType, roleTypeId, parameters, priority, isActive } = body;

  if (ruleType && !VALID_RULE_TYPES.includes(ruleType)) {
    return NextResponse.json(
      { error: `Invalid rule type. Must be one of: ${VALID_RULE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate roleTypeId if provided
  if (roleTypeId) {
    const rt = await prisma.roleType.findUnique({ where: { id: roleTypeId } });
    if (!rt) {
      return NextResponse.json({ error: "Invalid role type ID" }, { status: 400 });
    }
  }

  const rule = await prisma.schedulingRule.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(ruleType !== undefined && { ruleType }),
      ...(roleTypeId !== undefined && { roleTypeId: roleTypeId || null }),
      ...(parameters !== undefined && { parameters }),
      ...(priority !== undefined && { priority }),
      ...(isActive !== undefined && { isActive }),
    },
    include: {
      roleType: {
        select: { id: true, name: true, displayName: true, category: true },
      },
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "UPDATE_RULE",
    "SchedulingRule",
    rule.id,
    { name: rule.name }
  );

  return NextResponse.json(rule);
}

// Lightweight toggle (active switch)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.schedulingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const body = await req.json();
  const { isActive } = body;

  if (typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  const rule = await prisma.schedulingRule.update({
    where: { id },
    data: { isActive },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    isActive ? "ENABLE_RULE" : "DISABLE_RULE",
    "SchedulingRule",
    rule.id,
    { name: rule.name }
  );

  return NextResponse.json(rule);
}

// Delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.schedulingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await prisma.schedulingRule.delete({ where: { id } });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "DELETE_RULE",
    "SchedulingRule",
    id,
    { name: existing.name }
  );

  return NextResponse.json({ success: true });
}
