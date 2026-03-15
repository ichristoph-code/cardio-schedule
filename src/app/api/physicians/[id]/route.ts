import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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
    email,
    phone,
    fteDays,
    isInterventionalist,
    isEP,
    officeDays,
    eligibleRoleIds,
    newPassword,
  } = body;

  // Verify physician exists
  const existing = await prisma.physician.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Physician not found" }, { status: 404 });
  }

  // Check if email is taken by another user
  if (email && email !== existing.user.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 }
      );
    }
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

    // Update user email and/or password
    const userUpdate: { email?: string; passwordHash?: string } = {};
    if (email && email !== existing.user.email) {
      userUpdate.email = email;
    }
    if (newPassword && newPassword.length >= 6) {
      userUpdate.passwordHash = await bcrypt.hash(newPassword, 12);
    }
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({
        where: { id: existing.userId },
        data: userUpdate,
      });
    }

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.physician.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Physician not found" }, { status: 404 });
  }

  // Prevent admin from deleting themselves
  if (existing.userId === session.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  // Delete physician and user (cascade handles eligibilities, office days)
  await prisma.$transaction(async (tx) => {
    // Delete related records that don't cascade
    await tx.scheduleAssignment.deleteMany({ where: { physicianId: id } });
    await tx.vacationRequest.deleteMany({ where: { physicianId: id } });
    await tx.noCallDayRequest.deleteMany({ where: { physicianId: id } });
    await tx.swapRequest.deleteMany({ where: { fromPhysicianId: id } });
    await tx.swapRequest.deleteMany({ where: { toPhysicianId: id } });
    await tx.holidayAssignment.deleteMany({ where: { physicianId: id } });
    await tx.physicianEligibility.deleteMany({ where: { physicianId: id } });
    await tx.physicianOfficeDay.deleteMany({ where: { physicianId: id } });
    await tx.physician.delete({ where: { id } });
    await tx.user.delete({ where: { id: existing.userId } });
  });

  return NextResponse.json({ success: true });
}
