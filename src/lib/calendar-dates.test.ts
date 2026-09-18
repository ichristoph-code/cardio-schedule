import { describe, it, expect } from "vitest";
import {
  addDays,
  coalesceDates,
  datesBetween,
  eachDateInRange,
  isoToUtc,
  subtractDates,
  utcToIso,
} from "./calendar-dates";

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("handles leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("does not drift across a DST transition (US spring forward 2027-03-14)", () => {
    // The whole point of UTC-midnight arithmetic: a local-time implementation
    // would land on 2027-03-14 twice or skip it.
    expect(addDays("2027-03-13", 1)).toBe("2027-03-14");
    expect(addDays("2027-03-14", 1)).toBe("2027-03-15");
    expect(addDays("2027-11-06", 1)).toBe("2027-11-07");
    expect(addDays("2027-11-07", 1)).toBe("2027-11-08");
  });
});

describe("isoToUtc / utcToIso", () => {
  it("round-trips at UTC midnight", () => {
    const d = isoToUtc("2027-07-04");
    expect(d.toISOString()).toBe("2027-07-04T00:00:00.000Z");
    expect(utcToIso(d)).toBe("2027-07-04");
  });
});

describe("eachDateInRange", () => {
  it("is inclusive of both ends", () => {
    expect(eachDateInRange("2027-05-01", "2027-05-04")).toEqual([
      "2027-05-01", "2027-05-02", "2027-05-03", "2027-05-04",
    ]);
  });

  it("returns a single date when start === end", () => {
    expect(eachDateInRange("2027-05-01", "2027-05-01")).toEqual(["2027-05-01"]);
  });

  it("returns [] for an inverted range", () => {
    expect(eachDateInRange("2027-05-04", "2027-05-01")).toEqual([]);
  });

  it("stops at the limit rather than looping forever", () => {
    expect(eachDateInRange("2027-01-01", "2099-01-01", 10)).toHaveLength(10);
  });
});

describe("coalesceDates", () => {
  it("merges consecutive dates into one range", () => {
    expect(coalesceDates(["2027-02-01", "2027-02-02", "2027-02-03"])).toEqual([
      { startDate: "2027-02-01", endDate: "2027-02-03" },
    ]);
  });

  it("splits on gaps and sorts unsorted input", () => {
    expect(coalesceDates(["2027-02-05", "2027-02-01", "2027-02-02"])).toEqual([
      { startDate: "2027-02-01", endDate: "2027-02-02" },
      { startDate: "2027-02-05", endDate: "2027-02-05" },
    ]);
  });

  it("de-duplicates", () => {
    expect(coalesceDates(["2027-02-01", "2027-02-01"])).toEqual([
      { startDate: "2027-02-01", endDate: "2027-02-01" },
    ]);
  });

  it("merges across a month boundary", () => {
    expect(coalesceDates(["2027-01-30", "2027-01-31", "2027-02-01"])).toEqual([
      { startDate: "2027-01-30", endDate: "2027-02-01" },
    ]);
  });

  it("returns [] for no dates", () => {
    expect(coalesceDates([])).toEqual([]);
  });
});

describe("subtractDates", () => {
  it("punches a hole in the middle, yielding two ranges", () => {
    expect(subtractDates("2027-06-01", "2027-06-05", ["2027-06-03"])).toEqual([
      { startDate: "2027-06-01", endDate: "2027-06-02" },
      { startDate: "2027-06-04", endDate: "2027-06-05" },
    ]);
  });

  it("trims the leading and trailing edges", () => {
    expect(subtractDates("2027-06-01", "2027-06-05", ["2027-06-01"])).toEqual([
      { startDate: "2027-06-02", endDate: "2027-06-05" },
    ]);
    expect(subtractDates("2027-06-01", "2027-06-05", ["2027-06-05"])).toEqual([
      { startDate: "2027-06-01", endDate: "2027-06-04" },
    ]);
  });

  it("returns [] when the range is fully covered", () => {
    const all = ["2027-06-01", "2027-06-02", "2027-06-03"];
    expect(subtractDates("2027-06-01", "2027-06-03", all)).toEqual([]);
  });

  it("leaves the range untouched when nothing overlaps", () => {
    expect(subtractDates("2027-06-01", "2027-06-03", ["2027-07-04"])).toEqual([
      { startDate: "2027-06-01", endDate: "2027-06-03" },
    ]);
  });

  it("handles a single-day range (the half-day case)", () => {
    expect(subtractDates("2027-06-01", "2027-06-01", ["2027-06-01"])).toEqual([]);
    expect(subtractDates("2027-06-01", "2027-06-01", ["2027-06-02"])).toEqual([
      { startDate: "2027-06-01", endDate: "2027-06-01" },
    ]);
  });

  it("throws on an implausibly long range rather than silently truncating it", () => {
    // A corrupt row must abort the edit, not come back shortened.
    expect(() => subtractDates("2027-01-01", "2099-01-01", [])).toThrow(RangeError);
  });

  it("produces several survivors from an alternating removal", () => {
    expect(
      subtractDates("2027-06-01", "2027-06-05", ["2027-06-02", "2027-06-04"]),
    ).toEqual([
      { startDate: "2027-06-01", endDate: "2027-06-01" },
      { startDate: "2027-06-03", endDate: "2027-06-03" },
      { startDate: "2027-06-05", endDate: "2027-06-05" },
    ]);
  });
});

describe("datesBetween", () => {
  it("is order-independent, so a backwards drag selects the same span", () => {
    const forward = datesBetween("2027-04-10", "2027-04-13");
    const backward = datesBetween("2027-04-13", "2027-04-10");
    expect(forward).toEqual(["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13"]);
    expect(backward).toEqual(forward);
  });

  it("returns one date when both ends are the same cell", () => {
    expect(datesBetween("2027-04-10", "2027-04-10")).toEqual(["2027-04-10"]);
  });
});
