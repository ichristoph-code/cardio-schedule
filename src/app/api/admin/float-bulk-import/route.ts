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

  for (const dateStr of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      results.push({ date: dateStr, status: "error", error: "Invalid date format" });
      errors++;
      continue;
    }

    const dateObj = new Date(dateStr + "T00:00:00Z");

    const existing = await (prisma.scheduleAssignment as any).findFirst({
      where: {
        scheduleId: schedule.id,
        physicianId,
        roleTypeId: floatRole.id,
        date: dateObj,
        isActive: true,
      },
      select: { id: true },
    });

    if (existing) {
      results.push({ date: dateStr, status: "skipped", reason: "already assigned" });
      skipped++;
      continue;
    }

    if (dryRun) {
      results.push({ date: dateStr, status: "would-create" });
      created++;
      continue;
    }

    try {
      const assignment = await (prisma.scheduleAssignment as any).create({
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
      results.push({
        date: dateStr,
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
    counts: { created, skipped, errors, total: dates.length },
    results,
  });
}
