import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** One consistent database snapshot; calculations never write to the database. */
export async function loadScheduleData(year: number, db: Prisma.TransactionClient = prisma) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const existing = await db.schedule.findUnique({ where: { year } });
  const [physicians, roleTypes, rules, dbHolidays, customHolidayRows, vacations,
    noCallDays, weeklyDaysOffRecords, priorHA, savedAssignments, holidayAssignments] = await Promise.all([
    db.physician.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }], include: { eligibilities: true, officeDays: true } }),
    db.roleType.findMany({ orderBy: { sortOrder: "asc" } }),
    db.schedulingRule.findMany({ where: { isActive: true }, include: { physician: true } }),
    db.holiday.findMany(),
    db.customHoliday.findMany({ where: { date: { gte: start, lte: end } }, select: { date: true, name: true, hidden: true } }),
    db.vacationRequest.findMany({ where: { status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } } }),
    db.noCallDayRequest.findMany({ where: { status: "APPROVED", date: { gte: start, lte: end } } }),
    db.physicianWeeklyDayOff.findMany(),
    db.holidayAssignment.findMany({ where: { year: { lt: year } }, include: { holiday: true } }),
    existing ? db.scheduleAssignment.findMany({ where: { scheduleId: existing.id } }) : Promise.resolve([]),
    db.holidayAssignment.findMany({ where: { year } }),
  ]);
  return { existing, physicians, roleTypes, rules, dbHolidays, customHolidayRows, vacations,
    noCallDays, weeklyDaysOffRecords, priorHA, savedAssignments, holidayAssignments };
}
export type ScheduleData = Awaited<ReturnType<typeof loadScheduleData>>;
