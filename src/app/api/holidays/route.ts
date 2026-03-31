import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const holidays = await prisma.holiday.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { assignments: true },
      },
    },
  });

  return NextResponse.json(holidays);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, weight } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Check for duplicate
  const existing = await prisma.holiday.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A holiday with this name already exists" }, { status: 409 });
  }

  const holiday = await prisma.holiday.create({
    data: {
      name,
      weight: weight ?? 1,
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "CREATE_HOLIDAY",
    "Holiday",
    holiday.id,
    { name, weight: holiday.weight }
  );

  return NextResponse.json(holiday, { status: 201 });
}
