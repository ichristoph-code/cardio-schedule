import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { VacationCalendarView } from "@/components/vacation/VacationCalendarView";
import { PhysicianPicker } from "@/components/vacation/PhysicianPicker";
import { LAST_PHYSICIAN_COOKIE, LAST_YEAR_COOKIE, selectableYears } from "@/lib/vacation-prefs";
import { Suspense } from "react";

export default async function VacationPage({
  searchParams,
}: {
  searchParams: Promise<{ physician?: string; year?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const sessionPhysicianId = (session.user as Record<string, unknown>).physicianId as string | null;

  const query = await searchParams;

  // Admins see all physicians; regular users only see themselves
  const physicians = await prisma.physician.findMany({
    where: isAdmin ? undefined : { id: sessionPhysicianId ?? "__none__" },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  if (physicians.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Physician Vacation &amp; Work Calendar</h1>
          <p className="text-muted-foreground">No physician profile linked to your account.</p>
        </div>
      </div>
    );
  }

  const cookieStore = await cookies();

  // Resolve the year: URL param > last viewed (cookie) > this year. Planning
  // runs ahead of the calendar, so once the practice is scheduling 2027 the
  // default should follow rather than snapping back to today's year.
  //
  // A URL param is taken at face value within a sane range, so a hand-typed
  // ?year= still works. The cookie is held to the picker's own list, so one
  // left over from a year that has rolled out of range can't strand the page
  // on an empty calendar.
  const paramYear = Number.parseInt(query.year ?? "", 10);
  const cookieYear = Number.parseInt(cookieStore.get(LAST_YEAR_COOKIE)?.value ?? "", 10);
  const selectedYear =
    (paramYear >= 2000 && paramYear <= 2100 && paramYear) ||
    (selectableYears().includes(cookieYear) && cookieYear) ||
    new Date().getFullYear();

  // Resolve selected physician: URL param > last viewed (cookie) > alphabetical first.
  const lastViewed = cookieStore.get(LAST_PHYSICIAN_COOKIE)?.value;
  const selectedId =
    (query.physician && physicians.some((p) => p.id === query.physician) && query.physician) ||
    (lastViewed && physicians.some((p) => p.id === lastViewed) && lastViewed) ||
    physicians[0].id;

  const physician = physicians.find((p) => p.id === selectedId)!;

  const [vacations, floatAssignments, rounderAssignments, callAssignments, noCallReqs, customHolidayRows] = await Promise.all([
    prisma.vacationRequest.findMany({
      where: {
        physicianId: selectedId,
        status: "APPROVED",
        startDate: { lte: new Date(Date.UTC(selectedYear, 11, 31)) },
        endDate: { gte: new Date(Date.UTC(selectedYear, 0, 1)) },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.scheduleAssignment.findMany({
      where: {
        physicianId: selectedId,
        isActive: true,
        roleType: { name: "HOSPITAL_FLOAT" },
        date: {
          gte: new Date(Date.UTC(selectedYear, 0, 1)),
          lte: new Date(Date.UTC(selectedYear, 11, 31)),
        },
      },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
    prisma.scheduleAssignment.findMany({
      where: {
        physicianId: selectedId,
        isActive: true,
        roleType: { name: "ICU_ROUNDER" },
        date: {
          gte: new Date(Date.UTC(selectedYear, 0, 1)),
          lte: new Date(Date.UTC(selectedYear, 11, 31)),
        },
      },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
    // General Call — both system-assigned (AUTO) and manually-set (MANUAL).
    prisma.scheduleAssignment.findMany({
      where: {
        physicianId: selectedId,
        isActive: true,
        roleType: { name: "GENERAL_CALL" },
        date: {
          gte: new Date(Date.UTC(selectedYear, 0, 1)),
          lte: new Date(Date.UTC(selectedYear, 11, 31)),
        },
      },
      select: { date: true, source: true },
      orderBy: { date: "asc" },
    }),
    prisma.noCallDayRequest.findMany({
      where: {
        physicianId: selectedId,
        status: "APPROVED",
        date: {
          gte: new Date(Date.UTC(selectedYear, 0, 1)),
          lte: new Date(Date.UTC(selectedYear, 11, 31)),
        },
      },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
    // Admin-marked holidays — global (not per physician), shown on every calendar.
    prisma.customHoliday.findMany({
      where: {
        date: {
          gte: new Date(Date.UTC(selectedYear, 0, 1)),
          lte: new Date(Date.UTC(selectedYear, 11, 31)),
        },
      },
      select: { date: true, name: true, hidden: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const floatDays = floatAssignments.map((a) => a.date.toISOString().split("T")[0]);
  const rounderDays = rounderAssignments.map((a) => a.date.toISOString().split("T")[0]);
  const callDays = callAssignments.map((a) => ({
    date: a.date.toISOString().split("T")[0],
    manual: a.source === "MANUAL",
  }));
  const noCallDays = noCallReqs.map((a) => a.date.toISOString().split("T")[0]);
  const customHolidays = customHolidayRows.map((h) => ({
    date: h.date.toISOString().split("T")[0],
    name: h.name,
    hidden: h.hidden,
  }));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Physician Vacation &amp; Work Calendar</h1>
        <p className="text-muted-foreground">Vacation, call, float, rounder, and holiday days by physician.</p>
      </div>

      {isAdmin && (
        <Suspense>
          <PhysicianPicker
            physicians={physicians}
            selectedId={selectedId}
            year={selectedYear}
          />
        </Suspense>
      )}

      <VacationCalendarView
        key={`${selectedId}-${selectedYear}`}
        year={selectedYear}
        physicianName={`${physician.firstName} ${physician.lastName}`}
        physicianId={physician.id}
        isAdmin={isAdmin}
        vacations={vacations.map((v) => ({
          id: v.id,
          startDate: v.startDate.toISOString().split("T")[0],
          endDate: v.endDate.toISOString().split("T")[0],
          reason: v.reason,
          halfDay: v.halfDay,
        }))}
        floatDays={floatDays}
        rounderDays={rounderDays}
        callDays={callDays}
        noCallDays={noCallDays}
        customHolidays={customHolidays}
      />
    </div>
  );
}
