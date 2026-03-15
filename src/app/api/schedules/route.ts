import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSchedule } from "@/lib/scheduler";
import { auditLog } from "@/lib/audit";

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

  const { year } = await req.json();
  if (!year || typeof year !== "number" || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    const result = await generateSchedule(year);

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
