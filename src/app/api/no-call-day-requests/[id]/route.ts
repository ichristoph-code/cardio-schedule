import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// PATCH /api/no-call-day-requests/[id] — approve, deny, or cancel
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { status, reviewNote } = await req.json();

  const request = await prisma.noCallDayRequest.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;

  // Physicians can only cancel their own pending requests
  if (!isAdmin) {
    if (status !== "CANCELLED") {
      return NextResponse.json({ error: "Physicians can only cancel requests" }, { status: 403 });
    }
    if (request.physicianId !== physicianId) {
      return NextResponse.json({ error: "Can only cancel your own requests" }, { status: 403 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Can only cancel pending requests" }, { status: 400 });
    }
  }

  // Admins can approve or deny pending requests
  if (isAdmin && (status === "APPROVED" || status === "DENIED")) {
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 });
    }
  }

  const updated = await prisma.noCallDayRequest.update({
    where: { id },
    data: {
      status,
      reviewedBy: isAdmin ? session.user.id : undefined,
      reviewedAt: isAdmin ? new Date() : undefined,
      reviewNote: reviewNote || null,
    },
    include: {
      physician: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const actionMap: Record<string, string> = {
    APPROVED: "APPROVE_NO_CALL_DAY",
    DENIED: "DENY_NO_CALL_DAY",
    CANCELLED: "CANCEL_NO_CALL_DAY",
  };
  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    actionMap[status] ?? status,
    "NoCallDayRequest",
    id,
    { previousStatus: request.status, newStatus: status, date: request.date.toISOString(), reviewNote }
  );

  return NextResponse.json(updated);
}
