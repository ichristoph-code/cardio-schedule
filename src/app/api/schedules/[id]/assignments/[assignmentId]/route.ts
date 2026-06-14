import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// PATCH /api/schedules/[id]/assignments/[assignmentId] — override assignment
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id, assignmentId } = await params;
  const { physicianId, force } = await req.json();

  if (!physicianId) {
    return NextResponse.json({ error: "physicianId required" }, { status: 400 });
  }

  // Verify the assignment belongs to this schedule
  const assignment = await prisma.scheduleAssignment.findFirst({
    where: { id: assignmentId, scheduleId: id },
    include: { roleType: { select: { category: true } } },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Check if new physician is eligible for this role — hard block.
  const eligibility = await prisma.physicianEligibility.findFirst({
    where: { physicianId, roleTypeId: assignment.roleTypeId },
  });

  if (!eligibility) {
    return NextResponse.json(
      { error: "Physician is not eligible for this role" },
      { status: 400 }
    );
  }

  // Soft constraint conflicts — surfaced as a warning the admin can override
  // with `force: true`. The auto-scheduler respects all of these; a manual
  // override may legitimately need to break them, so we warn rather than block.
  if (!force) {
    const conflicts = await detectConflicts(physicianId, assignment);
    if (conflicts.length > 0) {
      return NextResponse.json({ conflicts }, { status: 409 });
    }
  }

  const previousPhysicianId = assignment.physicianId;

  // Update assignment
  const updated = await prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: { physicianId, source: "MANUAL" },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
      roleType: {
        select: {
          id: true,
          name: true,
          displayName: true,
          category: true,
          sortOrder: true,
        },
      },
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "OVERRIDE_ASSIGNMENT",
    "ScheduleAssignment",
    assignmentId,
    {
      date: assignment.date.toISOString(),
      roleTypeId: assignment.roleTypeId,
      previousPhysicianId,
      newPhysicianId: physicianId,
      forced: Boolean(force),
    }
  );

  return NextResponse.json(updated);
}

// Returns human-readable warnings if the candidate physician has a scheduling
// conflict on the assignment's date. Empty array = no conflict.
async function detectConflicts(
  physicianId: string,
  assignment: {
    id: string;
    scheduleId: string;
    date: Date;
    roleTypeId: string;
    roleType: { category: string };
  }
): Promise<string[]> {
  const date = assignment.date;
  // @db.Date values are stored at UTC midnight; use UTC day-of-week to match.
  const dow = date.getUTCDay();
  const conflicts: string[] = [];

  // Vacation covering this date (full day blocks everything; half day blocks reading).
  const vacation = await prisma.vacationRequest.findFirst({
    where: {
      physicianId,
      status: "APPROVED",
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
  if (vacation) {
    if (vacation.halfDay === "NONE") {
      conflicts.push("On vacation this day");
    } else if (assignment.roleType.category === "READING") {
      conflicts.push("Only working a half day — should not read studies");
    }
  }

  // Recurring weekly day off.
  const weeklyOff = await prisma.physicianWeeklyDayOff.findFirst({
    where: { physicianId, dayOfWeek: dow },
  });
  if (weeklyOff) {
    conflicts.push("Recurring weekly day off");
  }

  // No-call day (only matters for on-call roles).
  if (assignment.roleType.category === "ON_CALL") {
    const noCall = await prisma.noCallDayRequest.findFirst({
      where: { physicianId, status: "APPROVED", date },
    });
    if (noCall) {
      conflicts.push("Has an approved no-call day");
    }
  }

  // Already assigned to another role on this date in the same schedule.
  const otherSameDay = await prisma.scheduleAssignment.findFirst({
    where: {
      scheduleId: assignment.scheduleId,
      date,
      physicianId,
      isActive: true,
      id: { not: assignment.id },
    },
    include: { roleType: { select: { displayName: true } } },
  });
  if (otherSameDay) {
    conflicts.push(`Already assigned to ${otherSameDay.roleType.displayName} this day`);
  }

  return conflicts;
}
