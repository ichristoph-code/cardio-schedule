import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

const VALID_CATEGORIES = ["ON_CALL", "DAYTIME", "READING", "SPECIAL"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.roleType.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Role type not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, displayName, category, description, sortOrder, minRequired, maxRequired } = body;

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  // Check name uniqueness if changing
  if (name && name !== existing.name) {
    const dup = await prisma.roleType.findUnique({ where: { name } });
    if (dup) {
      return NextResponse.json({ error: "A role type with this name already exists" }, { status: 409 });
    }
  }

  const roleType = await prisma.roleType.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(displayName !== undefined && { displayName }),
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description: description || null }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(minRequired !== undefined && { minRequired }),
      ...(maxRequired !== undefined && { maxRequired }),
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "UPDATE_ROLE_TYPE",
    "RoleType",
    roleType.id,
    { name: roleType.name }
  );

  return NextResponse.json(roleType);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.roleType.findUnique({
    where: { id },
    include: {
      _count: {
        select: { assignments: true, rules: true },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Role type not found" }, { status: 404 });
  }

  if (existing._count.assignments > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this role type has ${existing._count.assignments} schedule assignment(s). Remove them first.` },
      { status: 409 }
    );
  }

  if (existing._count.rules > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this role type is referenced by ${existing._count.rules} scheduling rule(s). Remove them first.` },
      { status: 409 }
    );
  }

  // Remove eligibilities first
  await prisma.physicianEligibility.deleteMany({ where: { roleTypeId: id } });
  await prisma.roleType.delete({ where: { id } });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "DELETE_ROLE_TYPE",
    "RoleType",
    id,
    { name: existing.name }
  );

  return NextResponse.json({ success: true });
}
