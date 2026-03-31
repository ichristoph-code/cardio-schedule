import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, weight } = body;

  // Check name uniqueness if changing
  if (name && name !== existing.name) {
    const dup = await prisma.holiday.findUnique({ where: { name } });
    if (dup) {
      return NextResponse.json({ error: "A holiday with this name already exists" }, { status: 409 });
    }
  }

  const holiday = await prisma.holiday.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(weight !== undefined && { weight }),
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "UPDATE_HOLIDAY",
    "Holiday",
    holiday.id,
    { name: holiday.name }
  );

  return NextResponse.json(holiday);
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
  const existing = await prisma.holiday.findUnique({
    where: { id },
    include: {
      _count: { select: { assignments: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }

  if (existing._count.assignments > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this holiday has ${existing._count.assignments} assignment(s). Remove them first.` },
      { status: 409 }
    );
  }

  await prisma.holiday.delete({ where: { id } });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "DELETE_HOLIDAY",
    "Holiday",
    id,
    { name: existing.name }
  );

  return NextResponse.json({ success: true });
}
