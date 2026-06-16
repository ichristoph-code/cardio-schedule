import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// POST /api/admin/vacation-bulk-import
// Body: {
//   physicianEmail: string,
//   ranges: Array<{ startDate: string; endDate: string; reason?: string }>,
//   defaultStatus: "APPROVED" | "PENDING",
//   dryRun: boolean
// }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;

  const body = await req.json() as {
    physicianEmail?: string;
    ranges?: Array<{ startDate: string; endDate: string; reason?: string; halfDay?: string }>;
    defaultStatus?: "APPROVED" | "PENDING";
    dryRun?: boolean;
    replaceExisting?: boolean;
    year?: number;
  };

  const { physicianEmail, ranges, defaultStatus = "APPROVED", dryRun = false, replaceExisting = false, year } = body;

  if (!physicianEmail?.trim()) {
    return NextResponse.json({ error: "physicianEmail is required" }, { status: 400 });
  }
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return NextResponse.json({ error: "Non-empty ranges array required" }, { status: 400 });
  }
  if (replaceExisting && (typeof year !== "number" || year < 2020 || year > 2100)) {
    return NextResponse.json({ error: "A valid year is required when replaceExisting is set" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: physicianEmail.trim() },
    include: { physician: { select: { id: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: `No user found with email: ${physicianEmail}` }, { status: 404 });
  }
  if (!user.physician) {
    return NextResponse.json({ error: `User ${physicianEmail} is not linked to a physician` }, { status: 400 });
  }

  const physicianId = user.physician.id;

  // Replace mode: wipe this physician's vacations overlapping the import year
  // before inserting, so a re-import is a clean slate rather than skipping rows
  // that overlap stale (e.g. previously mis-parsed) entries.
  let replaced = 0;
  if (replaceExisting && !dryRun) {
    const yearStart = new Date(Date.UTC(year!, 0, 1));
    const yearEnd = new Date(Date.UTC(year!, 11, 31));
    const del = await prisma.vacationRequest.deleteMany({
      where: { physicianId, startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
    });
    replaced = del.count;
    if (replaced > 0) {
      await auditLog(userId, "ADMIN_BULK_IMPORT_VACATION_REPLACE", "Physician", physicianId, {
        year, deletedCount: replaced, physicianEmail,
      });
    }
  }

  type RowResult =
    | { startDate: string; endDate: string; status: "created" | "would-create" }
    | { startDate: string; endDate: string; status: "skipped"; reason: string }
    | { startDate: string; endDate: string; status: "error"; error: string };

  const results: RowResult[] = [];
  let created = 0, skipped = 0, errors = 0;

  for (const r of ranges) {
    const { startDate: startStr, endDate: endStr, reason, halfDay } = r;
    const halfDayValue = halfDay === "MORNING" ? "MORNING" : halfDay === "AFTERNOON" ? "AFTERNOON" : "NONE";

    const startDate = new Date(startStr + "T00:00:00Z");
    const endDate = new Date(endStr + "T00:00:00Z");

    if (isNaN(startDate.valueOf()) || isNaN(endDate.valueOf())) {
      results.push({ startDate: startStr, endDate: endStr, status: "error", error: "Invalid date format" });
      errors++;
      continue;
    }
    if (endDate < startDate) {
      results.push({ startDate: startStr, endDate: endStr, status: "error", error: "End before start" });
      errors++;
      continue;
    }

    // Check for overlap
    const overlap = await prisma.vacationRequest.findFirst({
      where: {
        physicianId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, status: true },
    });

    if (overlap) {
      results.push({ startDate: startStr, endDate: endStr, status: "skipped", reason: `overlaps existing (${overlap.status})` });
      skipped++;
      continue;
    }

    if (dryRun) {
      results.push({ startDate: startStr, endDate: endStr, status: "would-create" });
      created++;
      continue;
    }

    try {
      const req = await prisma.vacationRequest.create({
        data: {
          physicianId,
          startDate,
          endDate,
          reason: reason || null,
          halfDay: halfDayValue as "NONE" | "MORNING" | "AFTERNOON",
          status: defaultStatus,
          ...(defaultStatus === "APPROVED"
            ? { reviewedBy: userId, reviewedAt: new Date() }
            : {}),
        },
        select: { id: true },
      });

      await auditLog(userId, "ADMIN_BULK_IMPORT_VACATION", "VacationRequest", req.id, {
        startDate: startStr, endDate: endStr, reason, physicianEmail,
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
    physicianEmail,
    physicianId,
    dryRun,
    defaultStatus,
    replaceExisting,
    replaced,
    counts: { created, skipped, errors, total: ranges.length },
    results,
  });
}
