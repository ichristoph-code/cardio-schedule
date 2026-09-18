import { describe, it, expect } from "vitest";
import { computeYearTallies, type VacationDayState } from "./year-tallies";
import { getFederalHolidayDatesForYear } from "./holidays";

const NO_VACATION = new Map<string, VacationDayState>();
const NO_HOLIDAYS = new Set<string>();

describe("computeYearTallies", () => {
  it("counts only Mon–Fri as weekdays", () => {
    // 2027 has 261 weekdays (Jan 1 is a Friday, Dec 31 is a Friday).
    const t = computeYearTallies(2027, NO_VACATION, NO_HOLIDAYS);
    expect(t.weekdays).toBe(261);
    expect(t.weekdaysWorked).toBe(261);
  });

  it("subtracts the built-in holidays from days worked", () => {
    const t = computeYearTallies(2027, NO_VACATION, getFederalHolidayDatesForYear(2027));
    expect(t.holidays).toBe(9);
    expect(t.weekdaysWorked).toBe(261 - 9);
  });

  it("ignores vacation days that fall on a weekend", () => {
    // Fri 2027-01-08 through Mon 2027-01-11 — four calendar days, two weekdays.
    const vacation = new Map<string, VacationDayState>([
      ["2027-01-08", "VACATION"],
      ["2027-01-09", "VACATION"], // Saturday
      ["2027-01-10", "VACATION"], // Sunday
      ["2027-01-11", "VACATION"],
    ]);
    const t = computeYearTallies(2027, vacation, NO_HOLIDAYS);
    expect(t.vacationDays).toBe(2);
    expect(t.weekdaysWorked).toBe(261 - 2);
  });

  it("does not spend a vacation day on a holiday", () => {
    // Christmas Eve 2027 is observed on Thu Dec 23.
    const vacation = new Map<string, VacationDayState>([["2027-12-23", "VACATION"]]);
    const t = computeYearTallies(2027, vacation, new Set(["2027-12-23"]));
    expect(t.holidays).toBe(1);
    expect(t.vacationDays).toBe(0);
  });

  it("splits a half day between vacation and worked", () => {
    const vacation = new Map<string, VacationDayState>([
      ["2027-03-01", "HALF_AM"],
      ["2027-03-02", "HALF_PM"],
    ]);
    const t = computeYearTallies(2027, vacation, NO_HOLIDAYS);
    expect(t.vacationDays).toBe(1);
    expect(t.weekdaysWorked).toBe(261 - 1);
  });

  it("partitions the working year exactly", () => {
    const vacation = new Map<string, VacationDayState>([
      ["2027-06-07", "VACATION"],
      ["2027-06-08", "VACATION"],
      ["2027-06-09", "HALF_AM"],
      ["2027-06-12", "VACATION"], // Saturday — not a weekday, contributes nothing
    ]);
    const t = computeYearTallies(2027, vacation, getFederalHolidayDatesForYear(2027));
    expect(t.holidays + t.vacationDays + t.weekdaysWorked).toBe(t.weekdays);
  });

  it("handles a leap year", () => {
    // 2028 is a leap year: 366 days, 260 weekdays.
    const t = computeYearTallies(2028, NO_VACATION, NO_HOLIDAYS);
    expect(t.weekdays).toBe(260);
  });
});
