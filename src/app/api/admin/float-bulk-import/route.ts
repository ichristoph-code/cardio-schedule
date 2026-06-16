import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// POST /api/admin/float-bulk-import
// Body: {
//   physicianEmail: string,
//   dates: string[],   // individual YYYY-MM-DD dates
//   year: number,
//   dryRun: boolean
// }
//
// Concurrency: relies on the @@unique([scheduleId, date, roleTypeId]) constraint
// on ScheduleAssignment. We attempt the create directly and handle the unique
// violation (Prisma error code P2002) at catch time — this eliminates the
// TOCTOU race that an explicit findFirst-then-create would have.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as Record<string, unknown>).id as string;

  const body = await req.json() as {
    physicianEmail?: string;
    dates?: string[];
    year?: number;
    dryRun?: boolean;
  };

  const { physicianEmail, dates, year, dryRun = false } = body;

  if (!physicianEmail?.trim()) {
    return NextResponse.json({ error: "physicianEmail is required" }, { status: 400 });
  }
  if (!Array.isArray(dates) || dates.length === 0) {
    return NextResponse.json({ error: "Non-empty dates array required" }, { status: 400 });
  }
  if (!year) {
    return NextResponse.json({ error: "year is required" }, { status: 400 });
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

  const [floatRole, schedule] = await Promise.all([
    prisma.roleType.findUnique({ where: { name: "HOSPITAL_FLOAT" } }),
    prisma.schedule.findUnique({ where: { year } }),
  ]);

  if (!floatRole) {
    return NextResponse.json({ error: "HOSPITAL_FLOAT role type not found" }, { status: 500 });
  }
  if (!schedule) {
    return NextResponse.json(
      { error: `No schedule found for ${year}. Generate a schedule first.` },
      { status: 400 }
    );
  }

  type RowResult =
    | { date: string; status: "created" | "would-create" }
    | { date: string; status: "skipped"; reason: string }
    | { date: string; status: "error"; error: string };

  const results: RowResult[] = [];
  let created = 0, skipped = 0, errors = 0;

  // Pre-fetch existing float assignments for these dates once, then resolve
  // every row in memory and insert in a single createMany — a create-per-date
  // loop is too many serial round-trips for a 40-day bulk import.
  const validDates = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const existing = await prisma.scheduleAssignment.findMany({
    where: {
      scheduleId: schedule.id,
      roleTypeId: floatRole.id,
      isActive: true,
      date: { in: validDates.map((d) => new Date(d + "T00:00:00Z")) },
    },
    select: { physicianId: true, date: true },
  });
  const holderByDate = new Map(
    existing.map((e) => [e.date.toISOString().slice(0, 10), e.physicianId]),
  );

  const toCreate: { scheduleId: string; physicianId: string; roleTypeId: string; date: Date; source: "MANUAL"; isActive: true }[] = [];

  for (const dateStr of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      results.push({ date: dateStr, status: "error", error: "Invalid date format" });
      errors++;
      continue;
    }

    const holder = holderByDate.get(dateStr);
    if (holder) {
      results.push({
        date: dateStr,
        status: "skipped",
        reason: holder === physicianId
          ? "already assigned to this physician"
          : `slot held by another physician (id ${holder})`,
      });
      skipped++;
      continue;
    }

    if (dryRun) {
      results.push({ date: dateStr, status: "would-create" });
      created++;
      continue;
    }

    toCreate.push({
      scheduleId: schedule.id,
      physicianId,
      roleTypeId: floatRole.id,
      date: new Date(dateStr + "T00:00:00Z"),
      source: "MANUAL",
      isActive: true,
    });
    // Reserve the slot in-memory so duplicate dates in this payload skip.
    holderByDate.set(dateStr, physicianId);
    results.push({ date: dateStr, status: "created" });
    created++;
  }

  if (!dryRun && toCreate.length > 0) {
    try {
      // skipDuplicates makes this race-safe against the
      // @@unique([scheduleId, date, roleTypeId]) constraint.
      const res = await prisma.scheduleAssignment.createMany({ data: toCreate, skipDuplicates: true });
      await auditLog(userId, "ADMIN_BULK_IMPORT_FLOAT", "Schedule", schedule.id, {
        physicianEmail, count: res.count, year,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Bulk insert failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    physicianEmail,
    physicianId,
    dryRun,
    counts: { created, skipped, errors, total: dates.length },
    results,
  });
}
