import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/no-call-day-requests — list no-call day requests
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;

  const requests = await prisma.noCallDayRequest.findMany({
    where: isAdmin ? {} : { physicianId: physicianId ?? undefined },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(requests);
}

// POST /api/no-call-day-requests — create no-call day requests (bulk)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ error: "Only physicians can request no-call days" }, { status: 403 });
  }

  const { dates, reason } = await req.json();

  if (!dates || !Array.isArray(dates) || dates.length === 0) {
    return NextResponse.json({ error: "At least one date is required" }, { status: 400 });
  }

  // Parse and validate all dates
  const parsedDates = dates.map((d: string) => new Date(d));
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const d of parsedDates) {
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
  }

  // Check for existing PENDING/APPROVED requests on same dates
  const existing = await prisma.noCallDayRequest.findMany({
    where: {
      physicianId,
      status: { in: ["PENDING", "APPROVED"] },
      date: { in: parsedDates },
    },
    select: { date: true },
  });

  if (existing.length > 0) {
    const existingDates = existing.map((e) => e.date.toISOString().split("T")[0]);
    return NextResponse.json(
      { error: `No-call day requests already exist for: ${existingDates.join(", ")}` },
      { status: 400 }
    );
  }

  // Batch create all requests
  const created = await prisma.$transaction(
    parsedDates.map((date) =>
      prisma.noCallDayRequest.create({
        data: {
          physicianId,
          date,
          reason: reason || null,
          status: "PENDING",
        },
        include: {
          physician: { select: { id: true, firstName: true, lastName: true } },
        },
      })
    )
  );

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "CREATE_NO_CALL_DAY_REQUESTS",
    "NoCallDayRequest",
    created[0].id,
    { dates, reason, count: created.length }
  );

  return NextResponse.json(created, { status: 201 });
}
