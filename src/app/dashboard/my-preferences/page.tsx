import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AnnualPreferencesView } from "@/components/preferences/AnnualPreferencesView";
import { MpiDayPreference } from "@/components/preferences/MpiDayPreference";

export default async function MyPreferencesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const physicianId = (session.user as Record<string, unknown>).physicianId as
    | string
    | null;

  if (!physicianId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Preferences</h1>
          <p className="text-muted-foreground">
            This page is for physicians only. Admin users don&apos;t have
            personal schedule preferences.
          </p>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  // Load existing requests for the current year
  const yearStart = new Date(`${currentYear}-01-01`);
  const yearEnd = new Date(`${currentYear}-12-31`);

  const [vacations, noCallDays, mpiRoleType] = await Promise.all([
    prisma.vacationRequest.findMany({
      where: {
        physicianId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.noCallDayRequest.findMany({
      where: {
        physicianId,
        status: { in: ["PENDING", "APPROVED"] },
        date: { gte: yearStart, lte: yearEnd },
      },
      orderBy: { date: "asc" },
    }),
    prisma.roleType.findFirst({ where: { name: "MPI_READER" } }),
  ]);

  // Check MPI eligibility and existing day preference
  let isMpiEligible = false;
  let mpiPreferredDay: number | null = null;

  if (mpiRoleType) {
    const eligibility = await prisma.physicianEligibility.findFirst({
      where: { physicianId, roleTypeId: mpiRoleType.id },
    });
    isMpiEligible = !!eligibility;

    if (isMpiEligible) {
      const mpiRules = await prisma.schedulingRule.findMany({
        where: {
          physicianId,
          roleTypeId: mpiRoleType.id,
          ruleType: "PREREQUISITE",
          isActive: true,
        },
      });
      const dayRule = mpiRules.find(
        (r) => (r.parameters as Record<string, unknown>).preferredDayOfWeek != null
      );
      if (dayRule) {
        mpiPreferredDay = (dayRule.parameters as Record<string, unknown>).preferredDayOfWeek as number;
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Preferences</h1>
        <p className="text-muted-foreground">
          Select your vacation days and no-call day preferences for the year.
          No-call days mean you&apos;re available for daytime roles but won&apos;t
          be assigned night call.
        </p>
      </div>

      <MpiDayPreference
        initialPreferredDay={mpiPreferredDay}
        isMpiEligible={isMpiEligible}
      />

      <AnnualPreferencesView
        physicianId={physicianId}
        initialYear={currentYear}
        existingVacations={vacations.map((v) => ({
          id: v.id,
          startDate: v.startDate.toISOString().split("T")[0],
          endDate: v.endDate.toISOString().split("T")[0],
          reason: v.reason,
          status: v.status,
        }))}
        existingNoCallDays={noCallDays.map((nc) => ({
          id: nc.id,
          date: nc.date.toISOString().split("T")[0],
          reason: nc.reason,
          status: nc.status,
        }))}
      />
    </div>
  );
}
