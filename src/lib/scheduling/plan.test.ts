import { describe, it, expect } from "vitest";
import { scopeSchema, dateRange, fingerprint } from "./plan";
import { formatLocalDate } from "@/lib/holidays";

describe("schedule scope validation", () => {
  it("rejects fractional years/months, reversed ranges, empty roles, and unscoped resets", () => {
    for (const input of [{ year: 2027.5 }, { year: 2027, startMonth: 1.5 }, { year: 2027, startMonth: 8, endMonth: 2 }, { year: 2027, roleTypeIds: [] }, { year: 2027, resetOnly: true }]) {
      expect(scopeSchema.safeParse(input).success).toBe(false);
    }
  });
  it("keeps database range bounds at UTC midnight", () => {
    const range = dateRange(scopeSchema.parse({ year: 2027, startMonth: 3, endMonth: 3 }));
    expect(range.gte.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(range.lte.toISOString()).toBe("2027-03-31T00:00:00.000Z");
  });
  it("compares persisted and in-memory snapshots independently of row ordering", () => {
    const rows = [{ id: "a", date: new Date("2027-01-01") }, { id: "b", date: new Date("2027-02-01") }];
    expect(fingerprint(rows)).toBe(fingerprint(JSON.parse(JSON.stringify([...rows].reverse()))));
    expect(fingerprint(rows)).not.toBe(fingerprint(rows.slice(1)));
  });
  it("keeps today's evening duties in the local calendar date", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try { expect(formatLocalDate(new Date("2026-09-19T19:00:00-07:00"))).toBe("2026-09-19"); }
    finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
});
