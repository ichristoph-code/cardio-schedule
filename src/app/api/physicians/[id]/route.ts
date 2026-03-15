import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    firstName,
    lastName,
    phone,
    fteDays,
    isInterventionalist,
    isEP,
    officeDays,
    eligibleRoleIds,
  } = body;

  // Verify physician exists
  const existing = await prisma.physician.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Physician not found" }, { status: 404 });
  }

  // Update physician profile in a transaction
  await prisma.$transaction(async (tx) => {
    // Update basic info
    await tx.physician.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone,
        fteDays,
        isInterventionalist,
        isEP,
      },
    });

    // Replace office days
    await tx.physicianOfficeDay.deleteMany({ where: { physicianId: id } });
    if (officeDays?.length) {
      await tx.physicianOfficeDay.createMany({
        data: officeDays.map((dayOfWeek: number) => ({
          physicianId: id,
          dayOfWeek,
        })),
      });
    }

    // Replace role eligibilities
    await tx.physicianEligibility.deleteMany({ where: { physicianId: id } });
    if (eligibleRoleIds?.length) {
      await tx.physicianEligibility.createMany({
        data: eligibleRoleIds.map((roleTypeId: string) => ({
          physicianId: id,
          roleTypeId,
        })),
      });
    }
  });

  return NextResponse.json({ success: true });
}
