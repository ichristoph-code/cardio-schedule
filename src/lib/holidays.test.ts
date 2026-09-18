import { describe, it, expect } from "vitest";
import { getFederalHolidayDatesForYear, getAllHolidayDatesForYear } from "./holidays";

describe("getFederalHolidayDatesForYear", () => {
  it("places MLK Day and Presidents' Day on the third Monday (2027: Jan 18 / Feb 15)", () => {
    const h = getFederalHolidayDatesForYear(2027);
    expect(h.get("2027-01-18")).toBe("Martin Luther King Jr. Day");
    expect(h.get("2027-02-15")).toBe("Presidents' Day");
  });

  it("moves them to the correct Mondays in other years", () => {
    const h26 = getFederalHolidayDatesForYear(2026);
    expect(h26.get("2026-01-19")).toBe("Martin Luther King Jr. Day");
    expect(h26.get("2026-02-16")).toBe("Presidents' Day");
    // Sundays in 2026 — must NOT be marked.
    expect(h26.has("2026-01-18")).toBe(false);
    expect(h26.has("2026-02-15")).toBe(false);
  });

  it("keeps the existing holidays intact", () => {
    const h = getFederalHolidayDatesForYear(2027);
    expect(h.get("2027-01-01")).toBe("New Year's Day");
    expect(h.get("2027-05-31")).toBe("Memorial Day");
    expect(h.get("2027-07-05")).toBe("Independence Day"); // Jul 4 2027 is a Sunday → observed Monday
    expect(h.get("2027-09-06")).toBe("Labor Day");
    expect(h.get("2027-11-25")).toBe("Thanksgiving");
    // Dec 25, 2027 is a Saturday → observed Friday Dec 24, which bumps
    // Christmas Eve back one weekday to Thursday Dec 23.
    expect(h.get("2027-12-24")).toBe("Christmas Day");
    expect(h.get("2027-12-23")).toBe("Christmas Eve");
    expect(h.has("2027-12-25")).toBe(false);
  });
});

describe("getAllHolidayDatesForYear", () => {
  it("merges custom holidays and lets a custom name override a built-in one", () => {
    const h = getAllHolidayDatesForYear(2027, [
      { date: "2027-03-17", name: "Practice Retreat" },
      { date: "2027-01-18", name: "MLK (custom)" },
    ]);
    expect(h.get("2027-03-17")).toBe("Practice Retreat");
    expect(h.get("2027-01-18")).toBe("MLK (custom)");
    expect(h.get("2027-02-15")).toBe("Presidents' Day");
  });
});
