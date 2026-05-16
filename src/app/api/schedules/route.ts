import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSchedule } from "@/lib/scheduler";
import { auditLog } from "@/lib/audit";

export const maxDuration = 60;

// GET /api/schedules — list all schedules
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await prisma.schedule.findMany({
    orderBy: { year: "desc" },
    include: {
      _count: { select: { assignments: true } },
    },
  });

  return NextResponse.json(schedules);
}

// POST /api/schedules — generate a new schedule
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { year, roleTypeIds, resetOnly, startMonth, endMonth } = await req.json();
  if (!year || typeof year !== "number" || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (roleTypeIds !== undefined && (!Array.isArray(roleTypeIds) || roleTypeIds.some((id: unknown) => typeof id !== "string"))) {
    return NextResponse.json({ error: "Invalid roleTypeIds" }, { status: 400 });
  }
  if (startMonth !== undefined && (typeof startMonth !== "number" || startMonth < 1 || startMonth > 12)) {
    return NextResponse.json({ error: "Invalid startMonth" }, { status: 400 });
  }
  if (endMonth !== undefined && (typeof endMonth !== "number" || endMonth < 1 || endMonth > 12)) {
    return NextResponse.json({ error: "Invalid endMonth" }, { status: 400 });
  }
  if (startMonth !== undefined && endMonth !== undefined && startMonth > endMonth) {
    return NextResponse.json({ error: "startMonth must be ≤ endMonth" }, { status: 400 });
  }

  // Reset-only: delete assignments for the given roles without regenerating
  if (resetOnly) {
    if (!Array.isArray(roleTypeIds) || roleTypeIds.length === 0) {
      return NextResponse.json({ error: "roleTypeIds required for reset" }, { status: 400 });
    }
    try {
      const schedule = await prisma.schedule.findUnique({ where: { year } });
      if (!schedule) {
        return NextResponse.json({ error: "No schedule found for that year" }, { status: 404 });
      }
      const { count } = await prisma.scheduleAssignment.deleteMany({
        where: { scheduleId: schedule.id, roleTypeId: { in: roleTypeIds } },
      });
      await auditLog(
        (session.user as Record<string, unknown>).id as string,
        "RESET_ROLES",
        "Schedule",
        schedule.id,
        { year, roleTypeIds, deletedCount: count }
      );
      return NextResponse.json({ deletedCount: count });
    } catch (error) {
      console.error("Schedule reset error:", error);
      return NextResponse.json({ error: "Failed to reset assignments" }, { status: 500 });
    }
  }

  try {
    const result = await generateSchedule(year, roleTypeIds, startMonth, endMonth);

    await auditLog(
      (session.user as Record<string, unknown>).id as string,
      "GENERATE_SCHEDULE",
      "Schedule",
      result.scheduleId,
      { year, assignmentCount: result.assignmentCount }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Schedule generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
