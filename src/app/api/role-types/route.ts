import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

const VALID_CATEGORIES = ["ON_CALL", "DAYTIME", "READING", "SPECIAL"];

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roleTypes = await prisma.roleType.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: {
          assignments: true,
          eligibilities: true,
          rules: true,
        },
      },
    },
  });

  return NextResponse.json(roleTypes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, displayName, category, description, sortOrder, minRequired, maxRequired } = body;

  if (!name || !displayName || !category) {
    return NextResponse.json(
      { error: "Name, display name, and category are required" },
      { status: 400 }
    );
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  // Check for duplicate name
  const existing = await prisma.roleType.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A role type with this name already exists" }, { status: 409 });
  }

  const roleType = await prisma.roleType.create({
    data: {
      name,
      displayName,
      category: category as "ON_CALL" | "DAYTIME" | "READING" | "SPECIAL",
      description: description || null,
      sortOrder: sortOrder ?? 0,
      minRequired: minRequired ?? 1,
      maxRequired: maxRequired ?? 1,
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "CREATE_ROLE_TYPE",
    "RoleType",
    roleType.id,
    { name, category }
  );

  return NextResponse.json(roleType, { status: 201 });
}
