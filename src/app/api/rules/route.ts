import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

const VALID_RULE_TYPES = ["EXCLUSION", "PREREQUISITE", "DISTRIBUTION", "CONFLICT"];

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await prisma.schedulingRule.findMany({
    include: {
      roleType: {
        select: { id: true, name: true, displayName: true, category: true },
      },
    },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, ruleType, roleTypeId, physicianId, parameters, priority, isActive } = body;

  if (!name || !ruleType || !parameters) {
    return NextResponse.json(
      { error: "Name, rule type, and parameters are required" },
      { status: 400 }
    );
  }

  if (!VALID_RULE_TYPES.includes(ruleType)) {
    return NextResponse.json(
      { error: `Invalid rule type. Must be one of: ${VALID_RULE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate roleTypeId exists if provided
  if (roleTypeId) {
    const roleType = await prisma.roleType.findUnique({ where: { id: roleTypeId } });
    if (!roleType) {
      return NextResponse.json({ error: "Invalid role type ID" }, { status: 400 });
    }
  }

  // Validate physicianId exists if provided
  if (physicianId) {
    const physician = await prisma.physician.findUnique({ where: { id: physicianId } });
    if (!physician) {
      return NextResponse.json({ error: "Invalid physician ID" }, { status: 400 });
    }
  }

  const rule = await prisma.schedulingRule.create({
    data: {
      name,
      description: description || null,
      ruleType: ruleType as "EXCLUSION" | "PREREQUISITE" | "DISTRIBUTION" | "CONFLICT",
      roleTypeId: roleTypeId || null,
      physicianId: physicianId || null,
      parameters,
      priority: priority ?? 0,
      isActive: isActive ?? true,
    },
    include: {
      roleType: {
        select: { id: true, name: true, displayName: true, category: true },
      },
      physician: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "CREATE_RULE",
    "SchedulingRule",
    rule.id,
    { name, ruleType }
  );

  return NextResponse.json(rule, { status: 201 });
}
