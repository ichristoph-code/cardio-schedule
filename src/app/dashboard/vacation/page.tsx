import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { VacationCalendarView } from "@/components/vacation/VacationCalendarView";
import { PhysicianPicker } from "@/components/vacation/PhysicianPicker";
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
  const currentYear = new Date().getFullYear();
  const selectedYear = query.year ? parseInt(query.year, 10) : currentYear;

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
          <h1 className="text-2xl font-bold tracking-tight">Vacation Calendar</h1>
          <p className="text-muted-foreground">No physician profile linked to your account.</p>
        </div>
      </div>
    );
  }

  // Resolve selected physician: URL param > first in list
  const selectedId = query.physician && physicians.find((p) => p.id === query.physician)
    ? query.physician
    : physicians[0].id;

  const physician = physicians.find((p) => p.id === selectedId)!;

  const vacations = await prisma.vacationRequest.findMany({
    where: {
      physicianId: selectedId,
      status: "APPROVED",
      startDate: { lte: new Date(selectedYear, 11, 31) },
      endDate: { gte: new Date(selectedYear, 0, 1) },
    },
    orderBy: { startDate: "asc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vacation Calendar</h1>
        <p className="text-muted-foreground">Approved vacation days by physician.</p>
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
          reason: v.reason ?? undefined,
        }))}
      />
    </div>
  );
}
