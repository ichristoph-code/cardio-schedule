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
    // Dec 25, 2027 is a Saturday. Christmas Eve keeps its date — it is Dec 24,
    // always — and the Christmas Day observance steps back to Thursday Dec 23
    // rather than colliding with it.
    expect(h.get("2027-12-24")).toBe("Christmas Eve");
    expect(h.get("2027-12-23")).toBe("Christmas Day (observed)");
    expect(h.has("2027-12-25")).toBe(false);
  });

  it("never moves Christmas Eve off Dec 24", () => {
    // Every day of the week Dec 25 can fall on, including both Saturday cases.
    for (const year of [2025, 2026, 2027, 2028, 2029, 2030, 2032, 2033]) {
      const h = getFederalHolidayDatesForYear(year);
      expect(h.get(`${year}-12-24`)).toBe("Christmas Eve");
    }
  });

  it("gives two distinct December days when Christmas falls on a Saturday", () => {
    for (const year of [2027, 2032]) {
      const h = getFederalHolidayDatesForYear(year);
      expect(h.get(`${year}-12-24`)).toBe("Christmas Eve");
      expect(h.get(`${year}-12-23`)).toBe("Christmas Day (observed)");
    }
  });

  it("labels Christmas Day plainly when it is observed on Dec 25", () => {
    // Dec 25, 2026 is a Friday — no shift, no "(observed)" qualifier.
    expect(getFederalHolidayDatesForYear(2026).get("2026-12-25")).toBe("Christmas Day");
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
