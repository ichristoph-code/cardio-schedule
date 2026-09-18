/**
 * Pure date-set helpers for bulk calendar-day edits.
 *
 * Dates are "YYYY-MM-DD" strings throughout. They sort lexicographically in
 * chronological order, so grouping and ordering need no Date objects — which
 * keeps this module free of the local-vs-UTC hazards that bite calendar code.
 * Only the explicit isoToUtc/utcToIso boundary converts to Date, always at UTC
 * midnight to match the @db.Date columns.
 */

const DAY_MS = 86_400_000;

export interface DateRangeStrings {
  startDate: string;
  endDate: string;
}

/** "2027-03-04" -> Date at 2027-03-04T00:00:00Z (matches Prisma @db.Date). */
export function isoToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Date -> "YYYY-MM-DD", read in UTC so it round-trips with isoToUtc. */
export function utcToIso(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function addDays(date: string, days: number): string {
  return utcToIso(new Date(isoToUtc(date).getTime() + days * DAY_MS));
}

/**
 * Every date from startDate to endDate inclusive. Returns [] when the range is
 * inverted. `limit` bounds the work so a corrupt row can't spin forever.
 */
export function eachDateInRange(
  startDate: string,
  endDate: string,
  limit = 4000,
): string[] {
  if (endDate < startDate) return [];
  const out: string[] = [];
  let cur = startDate;
  while (cur <= endDate && out.length < limit) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * Collapse a set of dates into the fewest contiguous ranges.
 * ["1-01","1-02","1-05"] -> [{1-01,1-02},{1-05,1-05}]
 *
 * Bulk vacation writes use this so a two-week selection becomes one
 * VacationRequest row rather than fourteen.
 */
export function coalesceDates(dates: Iterable<string>): DateRangeStrings[] {
  const sorted = [...new Set(dates)].sort();
  const out: DateRangeStrings[] = [];
  for (const date of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last.endDate, 1) === date) {
      last.endDate = date;
    } else {
      out.push({ startDate: date, endDate: date });
    }
  }
  return out;
}

/** Longest range subtractDates will rewrite: ~11 years, far past any real row. */
const MAX_SUBTRACT_SPAN = 4000;

/**
 * The parts of [startDate, endDate] NOT covered by `remove` — i.e. what should
 * survive when a bulk edit punches dates out of an existing vacation range.
 * Returns the original range unchanged when nothing overlaps.
 *
 * Throws rather than truncating an implausibly long range: the caller rewrites
 * a stored row from this result, so quietly dropping the tail would silently
 * shorten someone's vacation. Failing loudly aborts the transaction instead.
 */
export function subtractDates(
  startDate: string,
  endDate: string,
  remove: Iterable<string>,
): DateRangeStrings[] {
  const removeSet = remove instanceof Set ? remove : new Set(remove);
  const days = eachDateInRange(startDate, endDate, MAX_SUBTRACT_SPAN + 1);
  if (days.length > MAX_SUBTRACT_SPAN) {
    throw new RangeError(
      `Date range ${startDate}..${endDate} is longer than ${MAX_SUBTRACT_SPAN} days; refusing to rewrite it`,
    );
  }
  return coalesceDates(days.filter((d) => !removeSet.has(d)));
}

/**
 * Chronological span between two dates, either order — what a shift-click or a
 * drag from one calendar cell to another selects.
 */
export function datesBetween(a: string, b: string): string[] {
  return a <= b ? eachDateInRange(a, b) : eachDateInRange(b, a);
}
