import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// POST /api/admin/calendar-day
// Admin tool: set a single physician's day type from the calendar.
// Body: {
//   physicianId: string,
//   date: "YYYY-MM-DD",
//   year: number,
//   type: "clear" | "vacation" | "half_vacation" | "float" | "rounder" | "no_call" | "call",
//   halfPeriod?: "MORNING" | "AFTERNOON"   // only for half_vacation
// }
//
// Mapping:
//   vacation/half_vacation -> VacationRequest (APPROVED)
//   float                  -> ScheduleAssignment (HOSPITAL_FLOAT, MANUAL)
//   rounder                -> ScheduleAssignment (ICU_ROUNDER, MANUAL)
//   call                   -> ScheduleAssignment (GENERAL_CALL, MANUAL)
//   no_call                -> NoCallDayRequest (APPROVED)
//   clear                  -> removes this physician's vacation + manual float/rounder + no-call + general call
//
// Each set first clears the day so the result is exactly the chosen type.
const TYPES = ["clear", "vacation", "half_vacation", "float", "rounder", "no_call", "call"] as const;
type DayType = (typeof TYPES)[number];

const DAY_MS = 86_400_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as Record<string, unknown>).id as string;

  let body: {
    physicianId?: string;
    date?: string;
    year?: number;
    type?: string;
    halfPeriod?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { physicianId, date, year, type, halfPeriod } = body;

  if (!physicianId) {
    return NextResponse.json({ error: "physicianId is required" }, { status: 400 });
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (typeof year !== "number" || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "valid year is required" }, { status: 400 });
  }
  if (!type || !TYPES.includes(type as DayType)) {
    return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
  }
  const dayType = type as DayType;
  const halfValue = halfPeriod === "AFTERNOON" ? "AFTERNOON" : "MORNING";

  const physician = await prisma.physician.findUnique({ where: { id: physicianId }, select: { id: true } });
  if (!physician) {
    return NextResponse.json({ error: "Physician not found" }, { status: 404 });
  }

  const dateObj = new Date(`${date}T00:00:00.000Z`);

  // Resolve roles + ensure a schedule exists for the year (manual edits should
  // work even before a schedule has been generated).
  const [floatRole, icuRole, generalCallRole, schedule] = await Promise.all([
    prisma.roleType.findUnique({ where: { name: "HOSPITAL_FLOAT" }, select: { id: true } }),
    prisma.roleType.findUnique({ where: { name: "ICU_ROUNDER" }, select: { id: true } }),
    prisma.roleType.findUnique({ where: { name: "GENERAL_CALL" }, select: { id: true } }),
    prisma.schedule.upsert({
      where: { year },
      update: {},
      create: { year, status: "DRAFT", generatedAt: new Date() },
    }),
  ]);

  const missingRole =
    dayType === "float" && !floatRole ? "HOSPITAL_FLOAT"
    : dayType === "rounder" && !icuRole ? "ICU_ROUNDER"
    : dayType === "call" && !generalCallRole ? "GENERAL_CALL"
    : null;
  if (missingRole) {
    return NextResponse.json({ error: `Role type ${missingRole} not found` }, { status: 500 });
  }

  // ── 1. Clear the day for this physician ────────────────────────────────────
  // Remove (and split, if needed) any vacation covering this date.
  const vacs = await prisma.vacationRequest.findMany({
    where: {
      physicianId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateObj },
      endDate: { gte: dateObj },
    },
  });
  for (const v of vacs) {
    await prisma.vacationRequest.delete({ where: { id: v.id } });
    const beforeEnd = new Date(dateObj.getTime() - DAY_MS);
    if (v.startDate.getTime() <= beforeEnd.getTime()) {
      await prisma.vacationRequest.create({
        data: {
          physicianId,
          startDate: v.startDate,
          endDate: beforeEnd,
          status: v.status,
          reason: v.reason,
          halfDay: "NONE",
          reviewedBy: v.reviewedBy,
          reviewedAt: v.reviewedAt,
        },
      });
    }
    const afterStart = new Date(dateObj.getTime() + DAY_MS);
    if (afterStart.getTime() <= v.endDate.getTime()) {
      await prisma.vacationRequest.create({
        data: {
          physicianId,
          startDate: afterStart,
          endDate: v.endDate,
          status: v.status,
          reason: v.reason,
          halfDay: "NONE",
          reviewedBy: v.reviewedBy,
          reviewedAt: v.reviewedAt,
        },
      });
    }
  }

  // Remove this physician's manual float/rounder assignments for the day.
  const editableRoleIds = [floatRole?.id, icuRole?.id].filter((x): x is string => !!x);
  if (editableRoleIds.length > 0) {
    await prisma.scheduleAssignment.deleteMany({
      where: {
        scheduleId: schedule.id,
        physicianId,
        date: dateObj,
        roleTypeId: { in: editableRoleIds },
        source: "MANUAL",
      },
    });
  }

  // Remove this physician's no-call request for the day (any status).
  await prisma.noCallDayRequest.deleteMany({
    where: { physicianId, date: dateObj },
  });

  // Remove this physician's general call for the day — any source. Unlike
  // float/rounder (manual-only above), general call may be auto-assigned by the
  // scheduler, and a physician put on vacation/no-call shouldn't keep a call;
  // clearing here lets "Clear" and other types release it too.
  if (generalCallRole) {
    await prisma.scheduleAssignment.deleteMany({
      where: { scheduleId: schedule.id, physicianId, date: dateObj, roleTypeId: generalCallRole.id },
    });
  }

  // ── 2. Apply the requested type ────────────────────────────────────────────
  if (dayType === "vacation" || dayType === "half_vacation") {
    await prisma.vacationRequest.create({
      data: {
        physicianId,
        startDate: dateObj,
        endDate: dateObj,
        status: "APPROVED",
        halfDay: dayType === "half_vacation" ? halfValue : "NONE",
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });
  } else if (dayType === "float" || dayType === "rounder") {
    const roleId = (dayType === "float" ? floatRole : icuRole)!.id;
    // The @@unique([scheduleId, date, roleTypeId]) makes a role single-slot per
    // day, so free it (whoever held it) before assigning the chosen physician.
    await prisma.scheduleAssignment.deleteMany({
      where: { scheduleId: schedule.id, date: dateObj, roleTypeId: roleId },
    });
    await prisma.scheduleAssignment.create({
      data: {
        scheduleId: schedule.id,
        physicianId,
        roleTypeId: roleId,
        date: dateObj,
        source: "MANUAL",
        isActive: true,
      },
    });
  } else if (dayType === "no_call") {
    await prisma.noCallDayRequest.create({
      data: {
        physicianId,
        date: dateObj,
        status: "APPROVED",
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });
  } else if (dayType === "call") {
    // GENERAL_CALL is single-slot per day: free it (whoever held it, auto or
    // manual) then assign the chosen physician as a manual override.
    await prisma.scheduleAssignment.deleteMany({
      where: { scheduleId: schedule.id, date: dateObj, roleTypeId: generalCallRole!.id },
    });
    await prisma.scheduleAssignment.create({
      data: {
        scheduleId: schedule.id,
        physicianId,
        roleTypeId: generalCallRole!.id,
        date: dateObj,
        source: "MANUAL",
        isActive: true,
      },
    });
  }

  await auditLog(userId, "ADMIN_SET_CALENDAR_DAY", "Physician", physicianId, {
    date, type: dayType, year,
  });

  return NextResponse.json({ ok: true, physicianId, date, type: dayType });
}
