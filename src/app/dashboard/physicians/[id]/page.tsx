import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PhysicianProfileForm } from "@/components/physicians/PhysicianProfileForm";
import { MpiDayPreference } from "@/components/preferences/MpiDayPreference";
import { PhysicianProfileHeader } from "@/components/physicians/PhysicianProfileHeader";

interface PageProps {
  params: Promise<{ id: string }>;
}

const DAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

export default async function PhysicianDetailPage({ params }: PageProps) {
  const { id } = await params;

  const physician = await prisma.physician.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, role: true } },
      eligibilities: { include: { roleType: true } },
      officeDays: true,
    },
  });

  if (!physician) notFound();

  const roleTypes = await prisma.roleType.findMany({
    orderBy: { sortOrder: "asc" },
  });

  // Fetch assignment stats for the current year
  const currentYear = new Date().getFullYear();
  const currentSchedule = await prisma.schedule.findFirst({
    where: { year: currentYear },
    select: { id: true, year: true },
  });

  let assignmentCount = 0;
  let callCount = 0;
  if (currentSchedule) {
    const [total, calls] = await Promise.all([
      prisma.scheduleAssignment.count({
        where: { scheduleId: currentSchedule.id, physicianId: id, isActive: true },
      }),
      prisma.scheduleAssignment.count({
        where: {
          scheduleId: currentSchedule.id,
          physicianId: id,
          isActive: true,
          roleType: { category: "ON_CALL" },
        },
      }),
    ]);
    assignmentCount = total;
    callCount = calls;
  }

  // Check MPI eligibility and existing day preference for this physician
  const mpiRoleType = roleTypes.find((r) => r.name === "MPI_READER");
  let isMpiEligible = false;
  let mpiPreferredDay: number | null = null;

  if (mpiRoleType) {
    isMpiEligible = physician.eligibilities.some(
      (e) => e.roleTypeId === mpiRoleType.id
    );

    if (isMpiEligible) {
      const mpiRules = await prisma.schedulingRule.findMany({
        where: {
          physicianId: id,
          roleTypeId: mpiRoleType.id,
          ruleType: "PREREQUISITE",
          isActive: true,
        },
      });
      const dayRule = mpiRules.find(
        (r) =>
          (r.parameters as Record<string, unknown>).preferredDayOfWeek != null
      );
      if (dayRule) {
        mpiPreferredDay = (
          dayRule.parameters as Record<string, unknown>
        ).preferredDayOfWeek as number;
      }
    }
  }

  // Build profile header data
  const subspecialties: string[] = [];
  if (physician.isInterventionalist) subspecialties.push("Interventional");
  if (physician.isEP) subspecialties.push("Electrophysiology");
  if (subspecialties.length === 0) subspecialties.push("General Cardiology");

  const officeDayLabels = physician.officeDays
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((d) => DAY_NAMES[d.dayOfWeek] ?? `Day ${d.dayOfWeek}`);

  const eligibleRoleNames = physician.eligibilities
    .map((e) => e.roleType.displayName)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PhysicianProfileHeader
        firstName={physician.firstName}
        lastName={physician.lastName}
        email={physician.user.email}
        phone={physician.phone}
        fteDays={physician.fteDays}
        subspecialties={subspecialties}
        officeDays={officeDayLabels}
        eligibleRoles={eligibleRoleNames}
        totalEligibleRoles={physician.eligibilities.length}
        assignmentCount={assignmentCount}
        callCount={callCount}
        scheduleYear={currentSchedule?.year ?? currentYear}
        physicianId={id}
      />

      <PhysicianProfileForm
        physician={{
          id: physician.id,
          firstName: physician.firstName,
          lastName: physician.lastName,
          email: physician.user.email,
          phone: physician.phone,
          fteDays: physician.fteDays,
          isInterventionalist: physician.isInterventionalist,
          isEP: physician.isEP,
          officeDays: physician.officeDays.map((d) => d.dayOfWeek),
          eligibleRoleIds: physician.eligibilities.map((e) => e.roleTypeId),
        }}
        roleTypes={roleTypes.map((r) => ({
          id: r.id,
          name: r.name,
          displayName: r.displayName,
          category: r.category,
        }))}
      />

      <MpiDayPreference
        initialPreferredDay={mpiPreferredDay}
        isMpiEligible={isMpiEligible}
        physicianId={id}
      />
    </div>
  );
}
