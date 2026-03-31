import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

/**
 * POST /api/vacation-requests/[id]/remove-day
 *
 * Removes a single day from a multi-day vacation request by:
 * 1. Cancelling the original request
 * 2. Creating new request(s) for the remaining day ranges
 *
 * Body: { date: "YYYY-MM-DD" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { date } = await req.json();

  if (!date || typeof date !== "string") {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }

  const request = await prisma.vacationRequest.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "Vacation request not found" }, { status: 404 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;

  // Auth: must own the request or be admin
  if (!isAdmin && request.physicianId !== physicianId) {
    return NextResponse.json({ error: "Can only modify your own requests" }, { status: 403 });
  }

  if (request.status !== "PENDING" && request.status !== "APPROVED") {
    return NextResponse.json({ error: "Can only modify pending or approved requests" }, { status: 400 });
  }

  const removeDate = new Date(date + "T12:00:00");
  const startDate = new Date(request.startDate.toISOString().split("T")[0] + "T12:00:00");
  const endDate = new Date(request.endDate.toISOString().split("T")[0] + "T12:00:00");

  // Verify date is within the vacation range
  if (removeDate < startDate || removeDate > endDate) {
    return NextResponse.json({ error: "Date is not within this vacation request" }, { status: 400 });
  }

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  const userId = (session.user as Record<string, unknown>).id as string;
  const originalStatus = request.status;

  // If single-day vacation, just cancel it
  if (startStr === endStr) {
    await prisma.vacationRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await auditLog(userId, "CANCEL_VACATION", "VacationRequest", id, {
      previousStatus: originalStatus,
      newStatus: "CANCELLED",
      removedDate: date,
    });
    return NextResponse.json({ cancelled: true, newRequests: [] });
  }

  // Multi-day: cancel original and create new range(s) for remaining days
  const removeDateStr = removeDate.toISOString().split("T")[0];
  const dayBefore = new Date(removeDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(removeDate);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const dayBeforeStr = dayBefore.toISOString().split("T")[0];
  const dayAfterStr = dayAfter.toISOString().split("T")[0];

  // Build replacement ranges
  const newRanges: { startDate: Date; endDate: Date }[] = [];

  // Range before the removed day
  if (removeDateStr > startStr) {
    newRanges.push({
      startDate: new Date(startStr + "T00:00:00Z"),
      endDate: new Date(dayBeforeStr + "T00:00:00Z"),
    });
  }

  // Range after the removed day
  if (removeDateStr < endStr) {
    newRanges.push({
      startDate: new Date(dayAfterStr + "T00:00:00Z"),
      endDate: new Date(endStr + "T00:00:00Z"),
    });
  }

  // Execute in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Cancel the original
    await tx.vacationRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // Create replacement requests with the same status as original
    const created = [];
    for (const range of newRanges) {
      const newReq = await tx.vacationRequest.create({
        data: {
          physicianId: request.physicianId,
          startDate: range.startDate,
          endDate: range.endDate,
          reason: request.reason,
          status: originalStatus as "PENDING" | "APPROVED",
          reviewedBy: originalStatus === "APPROVED" ? request.reviewedBy : null,
          reviewedAt: originalStatus === "APPROVED" ? request.reviewedAt : null,
        },
      });
      created.push(newReq);
    }

    return created;
  });

  await auditLog(userId, "REMOVE_VACATION_DAY", "VacationRequest", id, {
    removedDate: date,
    originalRange: `${startStr} to ${endStr}`,
    newRequestIds: result.map((r) => r.id),
    preservedStatus: originalStatus,
  });

  return NextResponse.json({
    cancelled: true,
    removedDate: date,
    newRequests: result.map((r) => ({
      id: r.id,
      startDate: r.startDate.toISOString().split("T")[0],
      endDate: r.endDate.toISOString().split("T")[0],
      status: r.status,
    })),
  });
}
