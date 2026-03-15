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
  const { physicianId } = await req.json();

  if (!physicianId) {
    return NextResponse.json({ error: "physicianId required" }, { status: 400 });
  }

  // Verify the assignment belongs to this schedule
  const assignment = await prisma.scheduleAssignment.findFirst({
    where: { id: assignmentId, scheduleId: id },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  // Check if new physician is eligible for this role
  const eligibility = await prisma.physicianEligibility.findFirst({
    where: { physicianId, roleTypeId: assignment.roleTypeId },
  });

  if (!eligibility) {
    return NextResponse.json(
      { error: "Physician is not eligible for this role" },
      { status: 400 }
    );
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
    }
  );

  return NextResponse.json(updated);
}
