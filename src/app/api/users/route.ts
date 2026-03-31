import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      physician: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { email: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { email, password, role } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const validRoles = ["ADMIN", "PHYSICIAN"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  // Check for duplicate email
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash,
      role: (role as "ADMIN" | "PHYSICIAN") ?? "PHYSICIAN",
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
    "CREATE_USER",
    "User",
    user.id,
    { email: user.email, role: user.role }
  );

  return NextResponse.json(user, { status: 201 });
}
