import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// PATCH /api/no-call-day-requests/bulk — bulk approve/deny
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { ids, status, reviewNote } = await req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  if (!["APPROVED", "DENIED"].includes(status)) {
    return NextResponse.json({ error: "Status must be APPROVED or DENIED" }, { status: 400 });
  }

  // Verify all requests exist and are PENDING
  const requests = await prisma.noCallDayRequest.findMany({
    where: { id: { in: ids }, status: "PENDING" },
  });

  if (requests.length !== ids.length) {
    return NextResponse.json(
      { error: `Only ${requests.length} of ${ids.length} requests are pending` },
      { status: 400 }
    );
  }

  // Bulk update
  const updated = await prisma.noCallDayRequest.updateMany({
    where: { id: { in: ids } },
    data: {
      status,
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      reviewNote: reviewNote || null,
    },
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    status === "APPROVED" ? "BULK_APPROVE_NO_CALL_DAYS" : "BULK_DENY_NO_CALL_DAYS",
    "NoCallDayRequest",
    ids[0],
    { ids, count: updated.count, reviewNote }
  );

  return NextResponse.json({ count: updated.count, status });
}
