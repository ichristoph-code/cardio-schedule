// Which years a physician can browse to on their own calendar.
//
// Deliberately a plain module, not an export from a "use client" component: the
// pages that need this are Server Components, and shared values should not be
// reached for across the client boundary.

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

/** Parse a ?year= param, falling back to the current year when it isn't sane. */
export function parseYearParam(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
}
