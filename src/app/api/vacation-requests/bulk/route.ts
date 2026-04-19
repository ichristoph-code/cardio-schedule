import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// POST /api/vacation-requests/bulk
// Body: {
//   ranges: Array<{ startDate: string; endDate: string; reason?: string }>,
//   physicianId?: string  (admin only — creates on behalf of that physician)
// }
//
// Physicians: creates PENDING requests for themselves.
// Admins with physicianId: creates PENDING requests on behalf of that physician.
// Duplicate ranges (same physician + startDate + endDate, any status) are skipped.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as Record<string, unknown>).role === "ADMIN";
  const sessionPhysicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  const userId = (session.user as Record<string, unknown>).id as string;

  const body = await req.json() as {
    ranges?: Array<{ startDate: string; endDate: string; reason?: string }>;
    physicianId?: string;
  };
  const { ranges, physicianId: targetPhysicianId } = body;

  if (!Array.isArray(ranges) || ranges.length === 0) {
    return NextResponse.json({ error: "Non-empty ranges array required" }, { status: 400 });
  }

  let physicianId: string;
  if (isAdmin && targetPhysicianId) {
    physicianId = targetPhysicianId;
  } else if (sessionPhysicianId) {
    physicianId = sessionPhysicianId;
  } else {
    return NextResponse.json({ error: "Only physicians can submit vacation requests" }, { status: 403 });
  }

  type RowResult =
    | { startDate: string; endDate: string; status: "created" }
    | { startDate: string; endDate: string; status: "skipped"; reason: string }
    | { startDate: string; endDate: string; status: "error"; error: string };

  const results: RowResult[] = [];
  let created = 0, skipped = 0, errors = 0;

  for (const r of ranges) {
    const { startDate: startStr, endDate: endStr, reason } = r;

    if (!startStr || !endStr) {
      results.push({ startDate: startStr ?? "", endDate: endStr ?? "", status: "error", error: "Missing dates" });
      errors++;
      continue;
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);

    if (isNaN(startDate.valueOf()) || isNaN(endDate.valueOf())) {
      results.push({ startDate: startStr, endDate: endStr, status: "error", error: "Invalid date format" });
      errors++;
      continue;
    }

    if (endDate < startDate) {
      results.push({ startDate: startStr, endDate: endStr, status: "error", error: "End date is before start date" });
      errors++;
      continue;
    }

    const existing = await prisma.vacationRequest.findFirst({
      where: { physicianId, startDate, endDate },
      select: { id: true, status: true },
    });

    if (existing) {
      results.push({ startDate: startStr, endDate: endStr, status: "skipped", reason: `duplicate (${existing.status})` });
      skipped++;
      continue;
    }

    try {
      const created_req = await prisma.vacationRequest.create({
        data: {
          physicianId,
          startDate,
          endDate,
          reason: reason || null,
          status: "PENDING",
        },
        select: { id: true },
      });

      await auditLog(userId, "CREATE_VACATION_REQUEST", "VacationRequest", created_req.id, {
        startDate: startStr,
        endDate: endStr,
        reason,
        source: "file_upload",
      });

      results.push({ startDate: startStr, endDate: endStr, status: "created" });
      created++;
    } catch (err) {
      results.push({
        startDate: startStr,
        endDate: endStr,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  return NextResponse.json({
    counts: { created, skipped, errors, total: ranges.length },
    results,
  });
}
