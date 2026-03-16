import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/mpi-preference — get physician's preferred MPI reading day
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ eligible: false, preferredDay: null });
  }

  const mpiRole = await prisma.roleType.findFirst({ where: { name: "MPI_READER" } });
  if (!mpiRole) {
    return NextResponse.json({ eligible: false, preferredDay: null });
  }

  const eligibility = await prisma.physicianEligibility.findFirst({
    where: { physicianId, roleTypeId: mpiRole.id },
  });

  if (!eligibility) {
    return NextResponse.json({ eligible: false, preferredDay: null });
  }

  // Find existing preferredDayOfWeek rule for this physician + MPI_READER
  const rules = await prisma.schedulingRule.findMany({
    where: {
      physicianId,
      roleTypeId: mpiRole.id,
      ruleType: "PREREQUISITE",
      isActive: true,
    },
  });

  const dayRule = rules.find(
    (r) => (r.parameters as Record<string, unknown>).preferredDayOfWeek != null
  );

  return NextResponse.json({
    eligible: true,
    preferredDay: dayRule
      ? ((dayRule.parameters as Record<string, unknown>).preferredDayOfWeek as number)
      : null,
  });
}

// POST /api/mpi-preference — set or clear preferred MPI reading day
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ error: "Only physicians can set MPI preferences" }, { status: 403 });
  }

  const { preferredDay } = await req.json();

  // Validate: null (clear) or integer 1-5
  if (preferredDay !== null && (typeof preferredDay !== "number" || preferredDay < 1 || preferredDay > 5)) {
    return NextResponse.json({ error: "preferredDay must be 1-5 (Mon-Fri) or null" }, { status: 400 });
  }

  const mpiRole = await prisma.roleType.findFirst({ where: { name: "MPI_READER" } });
  if (!mpiRole) {
    return NextResponse.json({ error: "MPI Reader role not found" }, { status: 404 });
  }

  const eligibility = await prisma.physicianEligibility.findFirst({
    where: { physicianId, roleTypeId: mpiRole.id },
  });
  if (!eligibility) {
    return NextResponse.json({ error: "Not eligible for MPI Reader" }, { status: 403 });
  }

  // Find existing preferredDayOfWeek rule
  const existingRules = await prisma.schedulingRule.findMany({
    where: {
      physicianId,
      roleTypeId: mpiRole.id,
      ruleType: "PREREQUISITE",
    },
  });
  const existingRule = existingRules.find(
    (r) => (r.parameters as Record<string, unknown>).preferredDayOfWeek != null
  );

  // Get physician name for auto-generated rule name
  const physician = await prisma.physician.findUnique({
    where: { id: physicianId },
    select: { lastName: true },
  });

  if (preferredDay === null) {
    // Clear preference — delete existing rule if it exists
    if (existingRule) {
      await prisma.schedulingRule.delete({ where: { id: existingRule.id } });
    }
  } else if (existingRule) {
    // Update existing rule
    await prisma.schedulingRule.update({
      where: { id: existingRule.id },
      data: { parameters: { preferredDayOfWeek: preferredDay } },
    });
  } else {
    // Create new rule
    await prisma.schedulingRule.create({
      data: {
        name: `MPI Day Pref - Dr. ${physician?.lastName ?? "Unknown"}`,
        description: "Self-selected MPI reading day preference",
        ruleType: "PREREQUISITE",
        roleTypeId: mpiRole.id,
        physicianId,
        parameters: { preferredDayOfWeek: preferredDay },
        isActive: true,
        priority: 50,
      },
    });
  }

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "SET_MPI_DAY_PREFERENCE",
    "SchedulingRule",
    physicianId,
    { preferredDay }
  );

  return NextResponse.json({ success: true, preferredDay });
}
