// Run under a non-UTC timezone so a regression at the DB write boundary
// (storing LOCAL midnight instead of UTC midnight) is observable. Set before
// any Date math runs; Node honors runtime TZ changes for subsequent Date calls.
process.env.TZ = "America/New_York";

import { describe, it, expect } from "vitest";
import { __dateHelpers } from "./scheduler";

const { formatDate, toDbDate, toLocalMidnight } = __dateHelpers;

describe("scheduler date boundary (TZ=America/New_York)", () => {
  it("toDbDate stores a calendar date as exact UTC midnight", () => {
    const d = toDbDate("2026-01-01");
    expect(d.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it("round-trips a calendar date through write (toDbDate) and read (toLocalMidnight)", () => {
    for (const s of ["2026-01-01", "2026-03-15", "2026-07-04", "2026-12-31"]) {
      const stored = toDbDate(s); // what Prisma persists to @db.Date
      const back = formatDate(toLocalMidnight(stored)); // how the app reads it back
      expect(back).toBe(s);
    }
  });
});
