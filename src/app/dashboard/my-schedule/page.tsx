import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { MyScheduleView } from "@/components/schedule/MyScheduleView";
import { CalendarYearSelect } from "@/components/physicians/CalendarYearSelect";
import { browsableYears, parseYearParam } from "@/lib/calendar-years";

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const query = await searchParams;

  const physicianId = (session.user as Record<string, unknown>).physicianId as
    | string
    | null;

  if (!physicianId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Personal Task Calendar</h1>
        <p className="text-muted-foreground">
          Admin accounts don&apos;t have a personal schedule. Use the Schedule
          page to view all assignments.
        </p>
      </div>
    );
  }

  // Find all published schedules (or drafts if admin)
  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const allSchedules = await prisma.schedule.findMany({
    where: isAdmin ? {} : { status: "PUBLISHED" },
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });

  // Years to offer: the standard window plus any year that already has a
  // schedule. Previously this was ONLY years with a published schedule, which
  // meant a practice with one generated year had no way to reach the next one —
  // and the picker hid itself entirely, since it rendered only when there was
  // more than one option.
  const availableYears = browsableYears(allSchedules.map((s) => s.year));
  const selectedYear = parseYearParam(query.year);

  // A schedule may not exist for the selected year yet. That is an ordinary
  // state, not an error: assignments are simply empty, while approved vacation
  // and no-call days for that year still show.
  const schedule = allSchedules.find((s) => s.year === selectedYear);

  const [assignments, physician, vacations, noCallDays] = await Promise.all([
    schedule
      ? prisma.scheduleAssignment.findMany({
          where: {
            scheduleId: schedule.id,
            physicianId,
            isActive: true,
          },
          include: {
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
          orderBy: [{ date: "asc" }, { roleType: { sortOrder: "asc" } }],
        })
      : [],
    prisma.physician.findUnique({
      where: { id: physicianId },
      select: { firstName: true, lastName: true },
    }),
    prisma.vacationRequest.findMany({
      where: {
        physicianId,
        status: "APPROVED",
        startDate: { lte: new Date(selectedYear, 11, 31) },
        endDate: { gte: new Date(selectedYear, 0, 1) },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.noCallDayRequest.findMany({
      where: {
        physicianId,
        status: "APPROVED",
        date: {
          gte: new Date(selectedYear, 0, 1),
          lte: new Date(selectedYear, 11, 31),
        },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const physicianName = physician
    ? `${physician.firstName} ${physician.lastName}`
    : "Your";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Personal Task Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {physicianName}&apos;s assignments for {selectedYear}
          </p>
        </div>
        <CalendarYearSelect years={availableYears} selectedYear={selectedYear} />
      </div>

      {!schedule && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No schedule has been published for {selectedYear} yet. Any approved
          vacation and no-call days you already have for that year are shown
          below.
        </div>
      )}

      <MyScheduleView
        key={selectedYear}
        year={selectedYear}
        physicianName={physicianName}
        assignments={assignments.map((a) => ({
          id: a.id,
          date: a.date.toISOString().split("T")[0],
          roleName: a.roleType.name,
          roleDisplayName: a.roleType.displayName,
          roleCategory: a.roleType.category,
          source: a.source,
        }))}
        vacations={vacations.map((v) => ({
          id: v.id,
          startDate: v.startDate.toISOString().split("T")[0],
          endDate: v.endDate.toISOString().split("T")[0],
          reason: v.reason,
        }))}
        noCallDays={noCallDays.map((nc) => ({
          id: nc.id,
          date: nc.date.toISOString().split("T")[0],
          reason: nc.reason,
        }))}
      />
    </div>
  );
}
