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

  // For dry-run we still need to detect conflicts. Fetch existing float
  // assignments for this schedule in a single query keyed by date.
  let existingByDate: Map<string, { physicianId: string }> | null = null;
  if (dryRun) {
    const existing = await prisma.scheduleAssignment.findMany({
      where: {
        scheduleId: schedule.id,
        roleTypeId: floatRole.id,
        isActive: true,
        date: { in: dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map((d) => new Date(d + "T00:00:00Z")) },
      },
      select: { physicianId: true, date: true },
    });
    existingByDate = new Map(
      existing.map((e) => [e.date.toISOString().slice(0, 10), { physicianId: e.physicianId }]),
    );
  }

  for (const dateStr of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      results.push({ date: dateStr, status: "error", error: "Invalid date format" });
      errors++;
      continue;
    }

    const dateObj = new Date(dateStr + "T00:00:00Z");

    if (dryRun) {
      const existing = existingByDate!.get(dateStr);
      if (existing) {
        if (existing.physicianId === physicianId) {
          results.push({ date: dateStr, status: "skipped", reason: "already assigned to this physician" });
          skipped++;
        } else {
          results.push({
            date: dateStr,
            status: "skipped",
            reason: `slot held by another physician (id ${existing.physicianId})`,
          });
          skipped++;
        }
      } else {
        results.push({ date: dateStr, status: "would-create" });
        created++;
      }
      continue;
    }

    try {
      const assignment = await prisma.scheduleAssignment.create({
        data: {
          scheduleId: schedule.id,
          physicianId,
          roleTypeId: floatRole.id,
          date: dateObj,
          source: "MANUAL",
          isActive: true,
        },
        select: { id: true },
      });

      await auditLog(userId, "ADMIN_BULK_IMPORT_FLOAT", "ScheduleAssignment", assignment.id, {
        date: dateStr, physicianEmail,
      });

      results.push({ date: dateStr, status: "created" });
      created++;
    } catch (err) {
      // P2002 = unique constraint violation on (scheduleId, date, roleTypeId)
      // Race-safe handling: someone else (or a prior import) already holds this slot.
      const isUniqueViolation =
        typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
      if (isUniqueViolation) {
        // Look up the holder to give a helpful skip reason.
        const holder = await prisma.scheduleAssignment.findFirst({
          where: {
            scheduleId: schedule.id,
            roleTypeId: floatRole.id,
            date: dateObj,
            isActive: true,
          },
          select: { physicianId: true },
        });
        if (holder?.physicianId === physicianId) {
          results.push({ date: dateStr, status: "skipped", reason: "already assigned to this physician" });
        } else {
          results.push({
            date: dateStr,
            status: "skipped",
            reason: `slot held by another physician (id ${holder?.physicianId ?? "unknown"})`,
          });
        }
        skipped++;
      } else {
        results.push({
          date: dateStr,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        errors++;
      }
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
