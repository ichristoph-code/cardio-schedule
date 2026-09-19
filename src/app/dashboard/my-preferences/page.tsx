import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { MpiDayPreference } from "@/components/preferences/MpiDayPreference";
import { PreferredTaskDay } from "@/components/preferences/PreferredTaskDay";
import { CalendarSubscribeCard } from "@/components/preferences/CalendarSubscribeCard";

// Deliberately small: preferred task day, MPI reading day, and the calendar
// subscription link — nothing else.
//
// The annual vacation / no-call request calendar that used to sit below these
// (src/components/preferences/AnnualPreferencesView.tsx) is parked, not deleted.
// The request-and-approval flow it drives is on hold; the component and its API
// routes are intact, so bringing it back is a matter of rendering it again with
// the year, vacation, no-call and holiday data it takes.

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

  const [physician, mpiRoleType] = await Promise.all([
    prisma.physician.findUnique({
      where: { id: physicianId },
      select: { preferredTaskDay: true, calendarToken: true },
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
          Your standing preferences for how the schedule is built.
        </p>
      </div>

      <PreferredTaskDay
        initialPreferredDay={physician?.preferredTaskDay ?? null}
      />

      <MpiDayPreference
        initialPreferredDay={mpiPreferredDay}
        isMpiEligible={isMpiEligible}
      />

      <CalendarSubscribeCard initialToken={physician?.calendarToken ?? null} />
    </div>
  );
}
