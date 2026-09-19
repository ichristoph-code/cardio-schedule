import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIcsFeed, type FeedEvent } from "@/lib/ics";
import { formatLocalDate, getAllHolidayDatesForYear } from "@/lib/holidays";
import { browsableYears } from "@/lib/calendar-years";

// GET /api/ics/<token> — a physician's calendar feed, for subscribing from
// iPhone, Google Calendar, Outlook or anything else that reads iCalendar.
//
// No session: calendar apps can't log in, so the URL itself is the credential.
// The token is 192 random bits, unique per physician, and rotatable from
// My Preferences; whoever holds the link can read that one physician's
// schedule and nothing else. Treat it like a Google Calendar "secret address".
//
// Contents, by decision: every published assignment, approved vacation and
// office holiday. No-call days are the absence of a duty and are left out.
// Everything is all-day and nothing carries a reminder — see src/lib/ics.ts.

export const dynamic = "force-dynamic";

const NOT_FOUND = new NextResponse("Not found", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A malformed token can't match anything; refuse it before touching the DB.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NOT_FOUND;

  const physician = await prisma.physician.findUnique({
    where: { calendarToken: token },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!physician) return NOT_FOUND;

  const [assignments, vacations, customHolidayRows] = await Promise.all([
    // Only what's been published: a draft schedule isn't a commitment yet.
    prisma.scheduleAssignment.findMany({
      where: { physicianId: physician.id, isActive: true, schedule: { status: "PUBLISHED" } },
      select: { id: true, date: true, roleType: { select: { displayName: true } } },
    }),
    prisma.vacationRequest.findMany({
      where: { physicianId: physician.id, status: "APPROVED" },
      select: { id: true, startDate: true, endDate: true, halfDay: true },
    }),
    prisma.customHoliday.findMany({ select: { date: true, name: true, hidden: true } }),
  ]);

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const events: FeedEvent[] = [];

  for (const a of assignments) {
    events.push({
      uid: `duty-${a.id}@cardioschedule`,
      start: day(a.date),
      end: day(a.date),
      summary: a.roleType.displayName,
      description: "CardioSchedule",
      busy: true,
    });
  }

  for (const v of vacations) {
    const label = v.halfDay === "MORNING" ? "Vacation (AM)" : v.halfDay === "AFTERNOON" ? "Vacation (PM)" : "Vacation";
    events.push({
      uid: `vacation-${v.id}@cardioschedule`,
      start: day(v.startDate),
      end: day(v.endDate),
      summary: label,
      description: "CardioSchedule",
      busy: true,
    });
  }

  // Holidays for the years anyone would browse to, so next year's are there
  // as soon as a physician subscribes.
  const customHolidays = customHolidayRows.map((h) => ({ date: day(h.date), name: h.name, hidden: h.hidden }));
  for (const year of browsableYears()) {
    for (const [date, name] of getAllHolidayDatesForYear(year, customHolidays)) {
      events.push({
        uid: `holiday-${date}@cardioschedule`,
        start: date,
        end: date,
        summary: name,
        description: "Office holiday",
        busy: false,
      });
    }
  }

  const body = buildIcsFeed(events, {
    name: `CardioSchedule — ${physician.firstName} ${physician.lastName}`,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="cardioschedule-${formatLocalDate(new Date())}.ics"`,
      // Personal data behind a secret URL: never let a shared cache keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
