import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// GET /api/annual-preferences?year=2026 — get physician's vacations + no-call days for the year
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ error: "Only physicians can view preferences" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

  if (isNaN(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year}-12-31`);

  const [vacations, noCallDays] = await Promise.all([
    prisma.vacationRequest.findMany({
      where: {
        physicianId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.noCallDayRequest.findMany({
      where: {
        physicianId,
        status: { in: ["PENDING", "APPROVED"] },
        date: { gte: yearStart, lte: yearEnd },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return NextResponse.json({ year, vacations, noCallDays });
}

// POST /api/annual-preferences — submit all new selections in a transaction
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const physicianId = (session.user as Record<string, unknown>).physicianId as string | null;
  if (!physicianId) {
    return NextResponse.json({ error: "Only physicians can submit preferences" }, { status: 403 });
  }

  const { year, newVacations, newNoCallDays } = await req.json();

  if (!year || typeof year !== "number") {
    return NextResponse.json({ error: "Year required" }, { status: 400 });
  }

  const results = { vacationsCreated: 0, noCallDaysCreated: 0 };

  await prisma.$transaction(async (tx) => {
    // Create vacation requests
    if (newVacations && Array.isArray(newVacations)) {
      for (const v of newVacations) {
        if (!v.startDate || !v.endDate) continue;
        const start = new Date(v.startDate);
        const end = new Date(v.endDate);

        // Check for overlap with existing
        const overlap = await tx.vacationRequest.findFirst({
          where: {
            physicianId,
            status: { in: ["PENDING", "APPROVED"] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
        });

        if (!overlap) {
          await tx.vacationRequest.create({
            data: {
              physicianId,
              startDate: start,
              endDate: end,
              reason: v.reason || null,
              status: "PENDING",
            },
          });
          results.vacationsCreated++;
        }
      }
    }

    // Create no-call day requests
    if (newNoCallDays && Array.isArray(newNoCallDays) && newNoCallDays.length > 0) {
      const parsedDates = newNoCallDays.map((d: string) => new Date(d));

      // Check for existing
      const existing = await tx.noCallDayRequest.findMany({
        where: {
          physicianId,
          status: { in: ["PENDING", "APPROVED"] },
          date: { in: parsedDates },
        },
        select: { date: true },
      });

      const existingSet = new Set(existing.map((e) => e.date.toISOString().split("T")[0]));
      const newDates = parsedDates.filter(
        (d) => !existingSet.has(d.toISOString().split("T")[0])
      );

      for (const date of newDates) {
        await tx.noCallDayRequest.create({
          data: {
            physicianId,
            date,
            status: "PENDING",
          },
        });
        results.noCallDaysCreated++;
      }
    }
  });

  await auditLog(
    (session.user as Record<string, unknown>).id as string,
    "SUBMIT_ANNUAL_PREFERENCES",
    "Physician",
    physicianId,
    { year, ...results }
  );

  return NextResponse.json(results, { status: 201 });
}
