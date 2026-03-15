import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/vacation-requests — list vacation requests
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;

  const requests = await prisma.vacationRequest.findMany({
    where: isAdmin ? {} : { physicianId: physicianId ?? undefined },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

// POST /api/vacation-requests — create a vacation request
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ error: "Only physicians can request vacations" }, { status: 403 });
  }

  const { startDate, endDate, reason } = await req.json();

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Start and end dates required" }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
  }

  // Check for overlapping approved/pending requests
  const overlap = await prisma.vacationRequest.findFirst({
    where: {
      physicianId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  if (overlap) {
    return NextResponse.json(
      { error: "Overlapping vacation request already exists" },
      { status: 400 }
    );
  }

  const request = await prisma.vacationRequest.create({
    data: {
      physicianId,
      startDate: start,
      endDate: end,
      reason: reason || null,
      status: "PENDING",
    },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "CREATE_VACATION_REQUEST",
    "VacationRequest",
    request.id,
    { startDate, endDate, reason }
  );

  return NextResponse.json(request, { status: 201 });
}
