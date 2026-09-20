import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isoToUtc, utcToIso } from "@/lib/calendar-dates";
import { timelineRangeSchema, type TimelineData } from "@/lib/schedule-timeline";

// Read the visible date range across schedule years, without creating schedules.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const query = new URL(req.url).searchParams;
  const range = timelineRangeSchema.safeParse({ start: query.get("start"), end: query.get("end") });
  if (!range.success) return NextResponse.json({ error: "A valid date range of at most 186 days is required" }, { status: 400 });

  const { start, end } = range.data;
  try {
    const date = { gte: isoToUtc(start), lte: isoToUtc(end) };
    const [assignments, schedules, customHolidays] = await Promise.all([
      prisma.scheduleAssignment.findMany({
        where: { isActive: true, date },
        include: {
          physician: { select: { id: true, firstName: true, lastName: true } },
          roleType: { select: { id: true, name: true, displayName: true, category: true, sortOrder: true } },
        },
        orderBy: [{ date: "asc" }, { roleType: { sortOrder: "asc" } }],
      }),
      prisma.schedule.findMany({
        where: { year: { gte: Number(start.slice(0, 4)), lte: Number(end.slice(0, 4)) } },
        select: { id: true, year: true, status: true },
      }),
      prisma.customHoliday.findMany({ where: { date }, select: { date: true, name: true, hidden: true } }),
    ]);
    const data: TimelineData = {
      schedules,
      assignments: assignments.map((a) => ({
        id: a.id, scheduleId: a.scheduleId, date: utcToIso(a.date),
        physicianId: a.physician.id,
        physicianName: `${a.physician.firstName} ${a.physician.lastName}`,
        physicianLastName: a.physician.lastName,
        roleTypeId: a.roleType.id, roleName: a.roleType.name,
        roleDisplayName: a.roleType.displayName, roleCategory: a.roleType.category,
        roleSortOrder: a.roleType.sortOrder, source: a.source,
      })),
      customHolidays: customHolidays.map((h) => ({ ...h, date: utcToIso(h.date) })),
    };
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load schedule timeline", error);
    return NextResponse.json({ error: "Unable to load these dates. Please retry." }, { status: 500 });
  }
}
