import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// PATCH /api/swap-requests/[id] — peer accept, admin approve/deny, cancel
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action, reviewNote } = await req.json();

  const request = await prisma.swapRequest.findUnique({
    where: { id },
    include: { roleType: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  const userId = (session.user as Record<string, unknown>).id as string;

  // PEER ACCEPT: target physician accepts the swap
  if (action === "peer_accept") {
    if (request.toPhysicianId !== physicianId) {
      return NextResponse.json({ error: "Only the target physician can accept" }, { status: 403 });
    }
    if (request.status !== "PENDING" || request.peerAccepted) {
      return NextResponse.json({ error: "Cannot accept this request" }, { status: 400 });
    }

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: { peerAccepted: true, peerAcceptedAt: new Date() },
      include: {
        fromPhysician: { select: { id: true, firstName: true, lastName: true } },
        toPhysician: { select: { id: true, firstName: true, lastName: true } },
        roleType: { select: { id: true, displayName: true, category: true } },
      },
    });

    await auditLog(userId, "PEER_ACCEPT_SWAP", "SwapRequest", id, {
      fromPhysicianId: request.fromPhysicianId,
      toPhysicianId: request.toPhysicianId,
    });

    return NextResponse.json(updated);
  }

  // PEER DECLINE: target physician declines
  if (action === "peer_decline") {
    if (request.toPhysicianId !== physicianId) {
      return NextResponse.json({ error: "Only the target physician can decline" }, { status: 403 });
    }

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: { status: "DENIED", reviewNote: "Declined by peer" },
      include: {
        fromPhysician: { select: { id: true, firstName: true, lastName: true } },
        toPhysician: { select: { id: true, firstName: true, lastName: true } },
        roleType: { select: { id: true, displayName: true, category: true } },
      },
    });

    await auditLog(userId, "PEER_DECLINE_SWAP", "SwapRequest", id, {
      fromPhysicianId: request.fromPhysicianId,
    });

    return NextResponse.json(updated);
  }

  // CANCEL: requesting physician cancels
  if (action === "cancel") {
    if (request.fromPhysicianId !== physicianId && !isAdmin) {
      return NextResponse.json({ error: "Can only cancel your own requests" }, { status: 403 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Can only cancel pending requests" }, { status: 400 });
    }

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: {
        fromPhysician: { select: { id: true, firstName: true, lastName: true } },
        toPhysician: { select: { id: true, firstName: true, lastName: true } },
        roleType: { select: { id: true, displayName: true, category: true } },
      },
    });

    await auditLog(userId, "CANCEL_SWAP", "SwapRequest", id);

    return NextResponse.json(updated);
  }

  // ADMIN APPROVE: admin approves after peer has accepted
  if (action === "approve" && isAdmin) {
    if (!request.peerAccepted) {
      return NextResponse.json({ error: "Peer must accept first" }, { status: 400 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 });
    }

    // Execute the swap: update schedule assignments
    const schedule = await prisma.schedule.findFirst({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { year: "desc" },
    });

    if (schedule) {
      // Find the assignment being swapped
      const fromAssignment = await prisma.scheduleAssignment.findFirst({
        where: {
          scheduleId: schedule.id,
          date: request.date,
          roleTypeId: request.roleTypeId,
          physicianId: request.fromPhysicianId,
          isActive: true,
        },
      });

      if (fromAssignment) {
        await prisma.scheduleAssignment.update({
          where: { id: fromAssignment.id },
          data: { physicianId: request.toPhysicianId, source: "SWAP" },
        });
      }
    }

    const updated = await prisma.swapRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminApproved: true,
        adminApprovedAt: new Date(),
        reviewNote: reviewNote || null,
      },
      include: {
        fromPhysician: { select: { id: true, firstName: true, lastName: true } },
        toPhysician: { select: { id: true, firstName: true, lastName: true } },
        roleType: { select: { id: true, displayName: true, category: true } },
      },
    });

    await auditLog(userId, "ADMIN_APPROVE_SWAP", "SwapRequest", id, {
      fromPhysicianId: request.fromPhysicianId,
      toPhysicianId: request.toPhysicianId,
      date: request.date.toISOString(),
      roleTypeId: request.roleTypeId,
    });

    return NextResponse.json(updated);
  }

  // ADMIN DENY
  if (action === "deny" && isAdmin) {
    const updated = await prisma.swapRequest.update({
      where: { id },
      data: {
        status: "DENIED",
        reviewNote: reviewNote || null,
      },
      include: {
        fromPhysician: { select: { id: true, firstName: true, lastName: true } },
        toPhysician: { select: { id: true, firstName: true, lastName: true } },
        roleType: { select: { id: true, displayName: true, category: true } },
      },
    });

    await auditLog(userId, "ADMIN_DENY_SWAP", "SwapRequest", id, {
      reviewNote,
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
