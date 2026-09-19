// Year-at-a-glance tallies for the physician vacation calendar.
//
// Every figure here is counted in WEEKDAYS (Mon–Fri). Weekends are not work
// days, so a vacation that spans a weekend does not spend vacation days on it,
// and a holiday falling on a weekend costs nothing either.
//
// The three figures partition the working year exactly:
//
//     weekdays === holidays + vacationDays + weekdaysWorked
//
// A half day splits: 0.5 to vacation, 0.5 to worked. A holiday wins over
// vacation on the same date — you don't spend a vacation day on a day off.

import { formatLocalDate } from "./holidays";

export type VacationDayState = "VACATION" | "HALF_AM" | "HALF_PM";

/** A vacation request as the calendars receive it: a date range, optionally a half day. */
export interface VacationRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  halfDay?: string | null; // "MORNING" | "AFTERNOON" | null
}

/**
 * Expand vacation ranges into a per-day map of vacation state.
 *
 * Keys are local-calendar dates. Every calendar keys its days the same way, so
 * a range never lands a day off from the grid it is drawn on.
 */
export function buildVacationStateMap(vacations: VacationRange[]): Map<string, VacationDayState> {
  const map = new Map<string, VacationDayState>();
  for (const v of vacations) {
    const end = new Date(v.endDate + "T12:00:00");
    const state: VacationDayState =
      v.halfDay === "MORNING" ? "HALF_AM" : v.halfDay === "AFTERNOON" ? "HALF_PM" : "VACATION";
    const cursor = new Date(v.startDate + "T12:00:00");
    while (cursor <= end) {
      map.set(formatLocalDate(cursor), state);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

export interface YearTallies {
  /** Mon–Fri days in the year. */
  weekdays: number;
  /** Holidays landing on a weekday. */
  holidays: number;
  /** Weekday, non-holiday full vacation days. */
  fullDays: number;
  /** Weekday, non-holiday half vacation days. */
  halfDays: number;
  /** Weekday, non-holiday vacation: fullDays + halfDays / 2. */
  vacationDays: number;
  /** Weekdays that are neither holiday nor vacation. Half days count 0.5. */
  weekdaysWorked: number;
  /** Call days landing Mon–Fri. */
  weekdayCallDays: number;
  /** Call days landing Sat–Sun. */
  weekendCallDays: number;
}

/**
 * Tally a physician's year.
 *
 * @param year            Calendar year.
 * @param vacationByDate  "YYYY-MM-DD" → vacation state, as drawn on the calendar.
 * @param holidayDates    Holiday dates ("YYYY-MM-DD"), built-in plus custom.
 * @param callDates       General Call dates ("YYYY-MM-DD").
 */
export function computeYearTallies(
  year: number,
  vacationByDate: Map<string, VacationDayState>,
  holidayDates: Set<string> | Map<string, unknown>,
  callDates: Set<string> | Map<string, unknown> = new Set(),
): YearTallies {
  let weekdays = 0;
  let holidays = 0;
  let fullDays = 0;
  let halfDays = 0;
  let weekdaysWorked = 0;
  let weekdayCallDays = 0;
  let weekendCallDays = 0;

  const cursor = new Date(year, 0, 1);
  while (cursor.getFullYear() === year) {
    const dow = cursor.getDay();
    // 0 = Sunday, 6 = Saturday.
    const isWeekend = dow === 0 || dow === 6;
    const key = formatLocalDate(cursor);

    // Call is tallied across the whole week, and separately from the figures
    // below: a weekday spent on call is still a weekday worked, so it is not
    // subtracted from weekdaysWorked.
    if (callDates.has(key)) {
      if (isWeekend) weekendCallDays += 1;
      else weekdayCallDays += 1;
    }

    if (!isWeekend) {
      weekdays += 1;

      if (holidayDates.has(key)) {
        holidays += 1;
      } else {
        const vacation = vacationByDate.get(key);
        if (vacation === "VACATION") {
          fullDays += 1;
        } else if (vacation) {
          // Half day — morning or afternoon off, the rest worked.
          halfDays += 1;
          weekdaysWorked += 0.5;
        } else {
          weekdaysWorked += 1;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    weekdays,
    holidays,
    fullDays,
    halfDays,
    vacationDays: fullDays + halfDays / 2,
    weekdaysWorked,
    weekdayCallDays,
    weekendCallDays,
  };
}
