import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { PhysicianCalendar } from "@/components/physicians/PhysicianCalendar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CalendarYearSelect } from "@/components/physicians/CalendarYearSelect";

export default async function PhysicianCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  if (!isAdmin) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;

  const physician = await prisma.physician.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!physician) notFound();

  // Load all available schedule years
  const allSchedules = await prisma.schedule.findMany({
    select: { id: true, year: true },
    orderBy: { year: "desc" },
  });

  if (allSchedules.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/physicians">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {physician.firstName} {physician.lastName}
          </h1>
        </div>
        <p className="text-muted-foreground">
          No schedule has been generated yet.
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

  const [assignments, vacations, noCallDays] = await Promise.all([
    prisma.scheduleAssignment.findMany({
      where: {
        scheduleId: schedule.id,
        physicianId: id,
        isActive: true,
      },
      include: {
        roleType: {
          select: { displayName: true, category: true },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.vacationRequest.findMany({
      where: {
        physicianId: id,
        status: "APPROVED",
        startDate: { lte: new Date(schedule.year, 11, 31) },
        endDate: { gte: new Date(schedule.year, 0, 1) },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.noCallDayRequest.findMany({
      where: {
        physicianId: id,
        status: "APPROVED",
        date: {
          gte: new Date(schedule.year, 0, 1),
          lte: new Date(schedule.year, 11, 31),
        },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/physicians">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {physician.firstName} {physician.lastName} — {schedule.year} Calendar
        </h1>
        {availableYears.length > 1 && (
          <CalendarYearSelect
            years={availableYears}
            selectedYear={schedule.year}
          />
        )}
      </div>

      <PhysicianCalendar
        key={schedule.year}
        year={schedule.year}
        physicianName={`${physician.firstName} ${physician.lastName}`}
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
