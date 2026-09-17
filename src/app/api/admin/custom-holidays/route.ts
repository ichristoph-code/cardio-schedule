import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

// Admin tool: mark or unmark a calendar day as a holiday.
// Custom holidays are GLOBAL — they show (in yellow) on every physician's
// calendar, unlike the per-physician day types in /api/admin/calendar-day.
//
// POST   /api/admin/custom-holidays   { date: "YYYY-MM-DD", name?: string }
// DELETE /api/admin/custom-holidays   { date: "YYYY-MM-DD" }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 60;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || (session.user as Record<string, unknown>).role !== "ADMIN") return null;
  return (session.user as Record<string, unknown>).id as string;
}

async function readBody(req: Request): Promise<{ date?: string; name?: string } | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function parseDate(date: unknown): Date | null {
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  const d = new Date(`${date}T00:00:00.000Z`);
  // Reject impossible dates like 2027-02-30 (Date silently rolls them over).
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  return d;
}

export async function POST(req: Request) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const dateObj = parseDate(body.date);
  if (!dateObj) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const name = (typeof body.name === "string" ? body.name : "").trim().slice(0, MAX_NAME) || "Holiday";

  // Upsert so re-marking a day simply renames it.
  const holiday = await prisma.customHoliday.upsert({
    where: { date: dateObj },
    update: { name },
    create: { date: dateObj, name, createdBy: userId },
  });

  await auditLog(userId, "ADMIN_SET_HOLIDAY", "CustomHoliday", holiday.id, {
    date: body.date, name,
  });

  return NextResponse.json({ ok: true, date: body.date, name }, { status: 201 });
}

export async function DELETE(req: Request) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const dateObj = parseDate(body.date);
  if (!dateObj) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const existing = await prisma.customHoliday.findUnique({ where: { date: dateObj } });
  if (!existing) return NextResponse.json({ error: "No custom holiday on that date" }, { status: 404 });

  await prisma.customHoliday.delete({ where: { id: existing.id } });

  await auditLog(userId, "ADMIN_REMOVE_HOLIDAY", "CustomHoliday", existing.id, {
    date: body.date, name: existing.name,
  });

  return NextResponse.json({ ok: true, date: body.date });
}
