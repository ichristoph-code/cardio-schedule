// Which years a physician can browse to on their own calendar.
//
// Deliberately a plain module, not an export from a "use client" component: the
// pages that need this are Server Components, and shared values should not be
// reached for across the client boundary.

/**
 * The year every calendar opens on when the URL doesn't say otherwise.
 *
 * Hardcoded on purpose, for now: the practice is scheduling 2027, and the
 * calendar year (2026) is the wrong default for everyone. This is the simplest
 * thing that works — no cookie, no per-user setting. When the practice moves on
 * to 2028, change this one number. Anyone who wants 2026 uses the year picker.
 *
 * A remembered per-user year was tried (#33) and reverted (#36) pending a real
 * diagnosis; see the task list. If it returns, it replaces this constant.
 */
export const DEFAULT_CALENDAR_YEAR = 2027;

/**
 * Last year through three ahead, plus any year that already has a schedule.
 *
 * Planning runs ahead of the calendar — vacation for next year is requested long
 * before that year's schedule is generated — so the range cannot be limited to
 * years that happen to have a published schedule. A physician needs to reach
 * next year to see the vacation they have already booked in it.
 *
 * @param scheduleYears Years that have a schedule, included even if outside the
 *                      default window so old schedules stay reachable.
 */
export function browsableYears(scheduleYears: number[] = []): number[] {
  const thisYear = new Date().getFullYear();
  const base = Array.from({ length: 5 }, (_, i) => thisYear - 1 + i);
  return [...new Set([...base, ...scheduleYears])].sort((a, b) => a - b);
}

/** Parse a ?year= param, falling back to DEFAULT_CALENDAR_YEAR when absent or not sane. */
export function parseYearParam(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return parsed >= 2000 && parsed <= 2100 ? parsed : DEFAULT_CALENDAR_YEAR;
}
