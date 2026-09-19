import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { VacationCalendarView } from "@/components/vacation/VacationCalendarView";
import { PhysicianPicker, LAST_PHYSICIAN_COOKIE } from "@/components/vacation/PhysicianPicker";
import { Suspense } from "react";
import { browsableYears, parseYearParam } from "@/lib/calendar-years";
import { CalendarYearSelect } from "@/components/physicians/CalendarYearSelect";

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
  // URL param wins; otherwise the shared default year (2027 for now).
  const selectedYear = parseYearParam(query.year);

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
          <h1 className="text-2xl font-bold tracking-tight">{isAdmin ? "Physician Calendar" : "My Vacation & Work Calendar"}</h1>
          <p className="text-muted-foreground">No physician profile linked to your account.</p>
        </div>
      </div>
    );
  }

  // Resolve selected physician: URL param > last viewed (cookie) > alphabetical first.
  const cookieStore = await cookies();
  const lastViewed = cookieStore.get(LAST_PHYSICIAN_COOKIE)?.value;
  const selectedId =
    (query.physician && physicians.some((p) => p.id === query.physician) && query.physician) ||
    (lastViewed && physicians.some((p) => p.id === lastViewed) && lastViewed) ||
    physicians[0].id;

  const physician = physicians.find((p) => p.id === selectedId)!;

  const [vacations, floatAssignments, callAssignments, noCallReqs, customHolidayRows] = await Promise.all([
    prisma.vacationRequest.findMany({
      where: {
        physicianId: selectedId,
        status: "APPROVED",
        startDate: { lte: new Date(Date.UTC(selectedYear, 11, 31)) },
        endDate: { gte: new Date(Date.UTC(selectedYear, 0, 1)) },
      },
      orderBy: { startDate: "asc" },
    }),
    // Hospital Float — generated (AUTO) and hand-entered (MANUAL), like call.
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
      select: { date: true, source: true },
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

  const floatDays = floatAssignments.map((a) => ({
    date: a.date.toISOString().split("T")[0],
    manual: a.source === "MANUAL",
  }));
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
        <h1 className="text-2xl font-bold tracking-tight">{isAdmin ? "Physician Calendar" : "My Vacation & Work Calendar"}</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Vacation, call, float, and holiday days by physician."
            : "Your vacation, call, float, and holiday days."}
        </p>
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

      {/* A physician sees only their own calendar, so no physician picker — but
          they still need to move between years. The admin's picker above
          carries its own year control; this is the same control on its own. */}
      {!isAdmin && (
        <Suspense>
          <CalendarYearSelect years={browsableYears()} selectedYear={selectedYear} />
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
        callDays={callDays}
        noCallDays={noCallDays}
        customHolidays={customHolidays}
      />
    </div>
  );
}
