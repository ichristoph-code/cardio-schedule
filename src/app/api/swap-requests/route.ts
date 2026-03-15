import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/swap-requests — list swap requests
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;

  const requests = await prisma.swapRequest.findMany({
    where: isAdmin
      ? {}
      : {
          OR: [
            { fromPhysicianId: physicianId ?? undefined },
            { toPhysicianId: physicianId ?? undefined },
          ],
        },
    include: {
      fromPhysician: { select: { id: true, firstName: true, lastName: true } },
      toPhysician: { select: { id: true, firstName: true, lastName: true } },
      roleType: { select: { id: true, displayName: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

// POST /api/swap-requests — create a swap request
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ error: "Only physicians can request swaps" }, { status: 403 });
  }

  const { date, roleTypeId, toPhysicianId } = await req.json();

  if (!date || !roleTypeId || !toPhysicianId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (toPhysicianId === physicianId) {
    return NextResponse.json({ error: "Cannot swap with yourself" }, { status: 400 });
  }

  // Verify the requesting physician actually has this assignment
  const schedule = await prisma.schedule.findFirst({
    where: { status: { in: ["DRAFT", "PUBLISHED"] } },
    orderBy: { year: "desc" },
  });

  if (!schedule) {
    return NextResponse.json({ error: "No active schedule" }, { status: 400 });
  }

  const assignment = await prisma.scheduleAssignment.findFirst({
    where: {
      scheduleId: schedule.id,
      date: new Date(date),
      roleTypeId,
      physicianId,
      isActive: true,
    },
  });

  if (!assignment) {
    return NextResponse.json(
      { error: "You don't have this assignment" },
      { status: 400 }
    );
  }

  // Check target physician is eligible for the role
  const eligible = await prisma.physicianEligibility.findFirst({
    where: { physicianId: toPhysicianId, roleTypeId },
  });

  if (!eligible) {
    return NextResponse.json(
      { error: "Target physician is not eligible for this role" },
      { status: 400 }
    );
  }

  // Check for duplicate pending swap
  const existing = await prisma.swapRequest.findFirst({
    where: {
      fromPhysicianId: physicianId,
      date: new Date(date),
      roleTypeId,
      status: "PENDING",
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A swap request already exists for this assignment" },
      { status: 400 }
    );
  }

  const request = await prisma.swapRequest.create({
    data: {
      fromPhysicianId: physicianId,
      toPhysicianId,
      date: new Date(date),
      roleTypeId,
      status: "PENDING",
    },
    include: {
      fromPhysician: { select: { id: true, firstName: true, lastName: true } },
      toPhysician: { select: { id: true, firstName: true, lastName: true } },
      roleType: { select: { id: true, displayName: true, category: true } },
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "CREATE_SWAP_REQUEST",
    "SwapRequest",
    request.id,
    { date, roleTypeId, toPhysicianId }
  );

  return NextResponse.json(request, { status: 201 });
}
