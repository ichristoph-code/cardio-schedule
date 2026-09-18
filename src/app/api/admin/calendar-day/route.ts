import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { coalesceDates, isoToUtc, subtractDates, utcToIso } from "@/lib/calendar-dates";
import type { Prisma } from "@/generated/prisma/client";

// POST /api/admin/calendar-day
// Admin tool: set one or many of a physician's days from the calendar.
// Body: {
//   physicianId: string,
//   date?: "YYYY-MM-DD",       // single day
//   dates?: ["YYYY-MM-DD"],    // bulk — takes precedence over `date`
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
// Every write is set-based over the whole date list rather than a loop over
// days, so applying a type to a 300-day selection costs the same handful of
// queries as applying it to one. The whole edit runs in a transaction: a bulk
// apply either lands completely or not at all, never half-written.
const TYPES = ["clear", "vacation", "half_vacation", "float", "rounder", "no_call", "call"] as const;
type DayType = (typeof TYPES)[number];

/** A year is 366 days; anything past this is a client bug, not a real edit. */
const MAX_DATES = 400;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as Record<string, unknown>).id as string;

  let body: {
    physicianId?: string;
    date?: string;
    dates?: unknown;
    year?: number;
    type?: string;
    halfPeriod?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { physicianId, date, dates, year, type, halfPeriod } = body;

  if (!physicianId) {
    return NextResponse.json({ error: "physicianId is required" }, { status: 400 });
  }

  // Accept either `dates` (bulk) or `date` (single) — normalise to one list.
  let dateList: string[];
  if (dates !== undefined) {
    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "dates must be a non-empty array" }, { status: 400 });
    }
    if (!dates.every((d): d is string => typeof d === "string" && ISO_DATE.test(d))) {
      return NextResponse.json({ error: "every date must be YYYY-MM-DD" }, { status: 400 });
    }
    dateList = [...new Set(dates as string[])].sort();
  } else {
    if (!date || !ISO_DATE.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    dateList = [date];
  }
  if (dateList.length > MAX_DATES) {
    return NextResponse.json(
      { error: `Too many dates (${dateList.length}); the maximum is ${MAX_DATES}` },
      { status: 400 },
    );
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

  const dateSet = new Set(dateList);
  const dateObjs = dateList.map(isoToUtc);
  const minDate = dateObjs[0];
  const maxDate = dateObjs[dateObjs.length - 1];

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

  await prisma.$transaction(
    async (tx) => {
      // ── 1. Clear every selected day for this physician ──────────────────────
      // Any vacation overlapping the selection is rewritten to the parts that
      // fall outside it: a selection can punch a hole in the middle of a range,
      // which splits it in two.
      const vacs = await tx.vacationRequest.findMany({
        where: {
          physicianId,
          status: { in: ["PENDING", "APPROVED"] },
          startDate: { lte: maxDate },
          endDate: { gte: minDate },
        },
      });

      const staleVacationIds: string[] = [];
      const survivingVacations: Prisma.VacationRequestCreateManyInput[] = [];
      for (const v of vacs) {
        const vStart = utcToIso(v.startDate);
        const vEnd = utcToIso(v.endDate);
        const remaining = subtractDates(vStart, vEnd, dateSet);
        // A row that merely sits inside [min,max] without touching a selected
        // day comes back whole — leave it alone rather than churning its id.
        const untouched =
          remaining.length === 1 &&
          remaining[0].startDate === vStart &&
          remaining[0].endDate === vEnd;
        if (untouched) continue;

        staleVacationIds.push(v.id);
        for (const r of remaining) {
          survivingVacations.push({
            physicianId,
            startDate: isoToUtc(r.startDate),
            endDate: isoToUtc(r.endDate),
            status: v.status,
            reason: v.reason,
            // Remnants are always whole days: a half-day row covers a single
            // date, so it is either fully removed or fully untouched above.
            halfDay: "NONE",
            reviewedBy: v.reviewedBy,
            reviewedAt: v.reviewedAt,
          });
        }
      }
      if (staleVacationIds.length > 0) {
        await tx.vacationRequest.deleteMany({ where: { id: { in: staleVacationIds } } });
      }
      if (survivingVacations.length > 0) {
        await tx.vacationRequest.createMany({ data: survivingVacations });
      }

      // This physician's manual float/rounder assignments on the selected days.
      const editableRoleIds = [floatRole?.id, icuRole?.id].filter((x): x is string => !!x);
      if (editableRoleIds.length > 0) {
        await tx.scheduleAssignment.deleteMany({
          where: {
            scheduleId: schedule.id,
            physicianId,
            date: { in: dateObjs },
            roleTypeId: { in: editableRoleIds },
            source: "MANUAL",
          },
        });
      }

      // This physician's no-call requests on the selected days (any status).
      await tx.noCallDayRequest.deleteMany({
        where: { physicianId, date: { in: dateObjs } },
      });

      // This physician's general call — any source. Unlike float/rounder
      // (manual-only above), general call may be auto-assigned by the
      // scheduler, and a physician put on vacation/no-call shouldn't keep a
      // call; clearing here lets "Clear" and other types release it too.
      if (generalCallRole) {
        await tx.scheduleAssignment.deleteMany({
          where: {
            scheduleId: schedule.id,
            physicianId,
            date: { in: dateObjs },
            roleTypeId: generalCallRole.id,
          },
        });
      }

      // ── 2. Apply the requested type to every selected day ───────────────────
      if (dayType === "vacation") {
        // Consecutive days collapse into one row, so a two-week block reads as
        // one vacation rather than fourteen.
        await tx.vacationRequest.createMany({
          data: coalesceDates(dateList).map((r) => ({
            physicianId,
            startDate: isoToUtc(r.startDate),
            endDate: isoToUtc(r.endDate),
            status: "APPROVED" as const,
            halfDay: "NONE" as const,
            reviewedBy: userId,
            reviewedAt: new Date(),
          })),
        });
      } else if (dayType === "half_vacation") {
        // Half-days can't be coalesced: halfDay applies to the whole row.
        await tx.vacationRequest.createMany({
          data: dateObjs.map((d) => ({
            physicianId,
            startDate: d,
            endDate: d,
            status: "APPROVED" as const,
            halfDay: halfValue as "MORNING" | "AFTERNOON",
            reviewedBy: userId,
            reviewedAt: new Date(),
          })),
        });
      } else if (dayType === "float" || dayType === "rounder" || dayType === "call") {
        const roleId = (dayType === "float" ? floatRole : dayType === "rounder" ? icuRole : generalCallRole)!.id;
        // @@unique([scheduleId, date, roleTypeId]) makes each role single-slot
        // per day, so free it (whoever held it) before assigning this physician.
        await tx.scheduleAssignment.deleteMany({
          where: { scheduleId: schedule.id, date: { in: dateObjs }, roleTypeId: roleId },
        });
        await tx.scheduleAssignment.createMany({
          data: dateObjs.map((d) => ({
            scheduleId: schedule.id,
            physicianId,
            roleTypeId: roleId,
            date: d,
            source: "MANUAL" as const,
            isActive: true,
          })),
        });
      } else if (dayType === "no_call") {
        await tx.noCallDayRequest.createMany({
          data: dateObjs.map((d) => ({
            physicianId,
            date: d,
            status: "APPROVED" as const,
            reviewedBy: userId,
            reviewedAt: new Date(),
          })),
        });
      }
    },
    // A 400-day apply is a dozen set-based statements, but give the pool room
    // on a cold connection rather than failing a long admin edit halfway.
    { timeout: 30_000, maxWait: 10_000 },
  );

  await auditLog(userId, "ADMIN_SET_CALENDAR_DAY", "Physician", physicianId, {
    type: dayType,
    year,
    count: dateList.length,
    ...(dateList.length === 1
      ? { date: dateList[0] }
      : { firstDate: dateList[0], lastDate: dateList[dateList.length - 1] }),
  });

  return NextResponse.json({
    ok: true,
    physicianId,
    type: dayType,
    date: dateList[0],
    dates: dateList,
    count: dateList.length,
  });
}
