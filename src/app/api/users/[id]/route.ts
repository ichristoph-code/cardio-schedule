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
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const { email, role } = body;

  const validRoles = ["ADMIN", "PHYSICIAN"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  // Check email uniqueness if changing
  if (email && email.toLowerCase() !== existing.email.toLowerCase()) {
    const dup = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
    });
    if (dup) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(email !== undefined && { email: email.trim().toLowerCase() }),
      ...(role !== undefined && { role }),
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "UPDATE_USER",
    "User",
    user.id,
    { email: user.email, role: user.role }
  );

  return NextResponse.json(user);
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
  const userId = (session.user as Record<string, unknown>).id as string;

  if (id === userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    include: {
      physician: {
        include: {
          _count: {
            select: { assignments: true },
          },
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (existing.physician && existing.physician._count.assignments > 0) {
    return NextResponse.json(
      { error: `Cannot delete: linked physician has ${existing.physician._count.assignments} schedule assignment(s). Remove the physician first.` },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });

  await auditLog(
    userId,
    "DELETE_USER",
    "User",
    id,
    { email: existing.email }
  );

  return NextResponse.json({ success: true });
}
