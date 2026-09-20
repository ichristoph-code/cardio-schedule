// Shared holiday helpers for the physician calendars.
//
// Two kinds of holiday feed the calendars:
//   1. Built-in federal holidays, computed from the year (below).
//   2. Custom holidays an admin marks on the Physician Calendar.
//      These live in the CustomHoliday table and apply to every physician.
//
// The scheduler and every calendar share this holiday list, including removals.

/** "YYYY-MM-DD" using local calendar fields (no timezone shifting). */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Federal "in lieu of" observance: Saturday -> preceding Friday, Sunday -> following Monday. */
function observed(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  if (dow === 6) r.setDate(r.getDate() - 1);
  else if (dow === 0) r.setDate(r.getDate() + 1);
  return r;
}

/** The nth (1-based) occurrence of a weekday (0=Sun..6=Sat) in a month. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(year, month, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (n - 1));
  return d;
}

/** Returns a Map of "YYYY-MM-DD" → holiday name for the built-in holidays. */
export function getFederalHolidayDatesForYear(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const fmt = formatLocalDate;

  map.set(fmt(observed(new Date(year, 0, 1))), "New Year's Day");
  // MLK Day: third Monday of January (e.g. Jan 18, 2027).
  map.set(fmt(nthWeekdayOfMonth(year, 0, 1, 3)), "Martin Luther King Jr. Day");
  // Presidents' Day: third Monday of February (e.g. Feb 15, 2027).
  map.set(fmt(nthWeekdayOfMonth(year, 1, 1, 3)), "Presidents' Day");
  map.set(fmt(observed(new Date(year, 6, 4))), "Independence Day");

  // Christmas Eve is Dec 24 — a date, not a floating observance. It never moves.
  //
  // Christmas Day follows the federal rule, which lands it on Dec 24 when Dec 25
  // is a Saturday (2027, 2032). That collides with the Eve, so the Christmas Day
  // OBSERVANCE steps back to the preceding weekday and the Eve keeps its date.
  // The practice still gets two days; they are just named truthfully.
  const christmasEve = new Date(year, 11, 24);
  const christmasDay = observed(new Date(year, 11, 25));
  if (fmt(christmasDay) === fmt(christmasEve)) {
    do {
      christmasDay.setDate(christmasDay.getDate() - 1);
    } while (christmasDay.getDay() === 0 || christmasDay.getDay() === 6);
  }
  map.set(fmt(christmasEve), "Christmas Eve");
  map.set(
    fmt(christmasDay),
    fmt(christmasDay) === fmt(new Date(year, 11, 25)) ? "Christmas Day" : "Christmas Day (observed)",
  );

  // Memorial Day: last Monday of May
  const memDay = new Date(year, 4, 31);
  while (memDay.getDay() !== 1) memDay.setDate(memDay.getDate() - 1);
  map.set(fmt(memDay), "Memorial Day");

  // Labor Day: first Monday of September
  map.set(fmt(nthWeekdayOfMonth(year, 8, 1, 1)), "Labor Day");

  // Thanksgiving: fourth Thursday of November
  map.set(fmt(nthWeekdayOfMonth(year, 10, 4, 4)), "Thanksgiving");

  return map;
}

export interface CustomHolidayInfo {
  date: string; // YYYY-MM-DD
  name: string;
  hidden?: boolean;
}

/**
 * Built-in holidays plus admin-added custom holidays for a year.
 * - hidden: true → suppresses the built-in holiday on that date
 * - hidden: false/undefined → adds or renames the holiday on that date
 */
export function getAllHolidayDatesForYear(
  year: number,
  customHolidays: CustomHolidayInfo[] = []
): Map<string, string> {
  const map = getFederalHolidayDatesForYear(year);
  for (const h of customHolidays) {
    if (h.hidden) {
      map.delete(h.date);
    } else {
      map.set(h.date, h.name);
    }
  }
  return map;
}
