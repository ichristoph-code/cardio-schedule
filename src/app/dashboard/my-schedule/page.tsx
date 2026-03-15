import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { MyScheduleView } from "@/components/schedule/MyScheduleView";
import { CalendarYearSelect } from "@/components/physicians/CalendarYearSelect";

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
        <h1 className="text-2xl font-bold tracking-tight">My Calendar</h1>
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

  if (allSchedules.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">My Calendar</h1>
        <p className="text-muted-foreground">
          No schedule has been published yet. Check back later.
        </p>
      </div>
    );
  }

  const availableYears = allSchedules.map((s) => s.year);
  const currentYear = new Date().getFullYear();

  // Selected year: URL param > current year > latest available
  const selectedYear = query.year
    ? parseInt(query.year, 10)
    : availableYears.includes(currentYear)
      ? currentYear
      : availableYears[0];

  const schedule = allSchedules.find((s) => s.year === selectedYear) ?? allSchedules[0];

  const [assignments, physician, vacations, noCallDays] = await Promise.all([
    prisma.scheduleAssignment.findMany({
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
    }),
    prisma.physician.findUnique({
      where: { id: physicianId },
      select: { firstName: true, lastName: true },
    }),
    prisma.vacationRequest.findMany({
      where: {
        physicianId,
        status: "APPROVED",
        startDate: { lte: new Date(schedule.year, 11, 31) },
        endDate: { gte: new Date(schedule.year, 0, 1) },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.noCallDayRequest.findMany({
      where: {
        physicianId,
        status: "APPROVED",
        date: {
          gte: new Date(schedule.year, 0, 1),
          lte: new Date(schedule.year, 11, 31),
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My Calendar</h1>
        {availableYears.length > 1 && (
          <CalendarYearSelect
            years={availableYears}
            selectedYear={schedule.year}
          />
        )}
      </div>
      <p className="text-muted-foreground">
        {physicianName}&apos;s assignments for {schedule.year}
      </p>

      <MyScheduleView
        key={schedule.year}
        year={schedule.year}
        physicianName={physicianName}
        assignments={assignments.map((a) => ({
          id: a.id,
          date: a.date.toISOString().split("T")[0],
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
