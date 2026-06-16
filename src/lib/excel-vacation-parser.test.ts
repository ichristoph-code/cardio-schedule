import { describe, it, expect } from "vitest";
import {
  extractColorCalendarRanges,
  matchPhysicianEmail,
  daysToRanges,
  isNextCalendarDay,
  type Worksheet,
  type XLSXLike,
} from "./excel-vacation-parser";

// ─── Test helper: build a worksheet from a simple grid spec ────────────────

interface CellSpec {
  v: string | number | Date;
  s?: { fgColor?: { rgb: string }; bgColor?: { rgb: string } };
}

/**
 * Build a worksheet object compatible with the parser, given a 2D grid where
 * each cell is either a CellSpec, a primitive (turned into { v }), or null.
 */
function makeWorksheet(grid: Array<Array<CellSpec | string | number | Date | null>>): Worksheet {
  const ws: Worksheet = {};
  let maxRow = 0;
  let maxCol = 0;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell == null) continue;
      const addr = colToA1(c) + (r + 1);
      ws[addr] = typeof cell === "object" && "v" in cell ? cell : { v: cell };
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
  }
  ws["!ref"] = `A1:${colToA1(maxCol)}${maxRow + 1}`;
  return ws;
}

function colToA1(c: number): string {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Minimal XLSX shim that just implements the two utils the parser needs.
const xlsx: XLSXLike = {
  utils: {
    decode_range(ref: string) {
      const [s, e] = ref.split(":");
      const parse = (a: string) => {
        const m = a.match(/^([A-Z]+)(\d+)$/)!;
        const cols = m[1];
        let c = 0;
        for (const ch of cols) c = c * 26 + (ch.charCodeAt(0) - 64);
        return { c: c - 1, r: parseInt(m[2]) - 1 };
      };
      return { s: parse(s), e: parse(e) };
    },
    encode_cell({ r, c }: { r: number; c: number }) {
      return colToA1(c) + (r + 1);
    },
  },
};

// ─── Helper: build a "physician tab" for a single month ────────────────────

/**
 * Build a tab with one month, SMTWTFS header row, then alternating date /
 * code rows. `codes` is keyed by ISO date string.
 */
function buildSingleMonthTab(opts: {
  monthName: string;
  year: number;
  month: number;
  dowLabels?: string[];
  /** Map of YYYY-MM-DD → "V" | "F" | "0.5V" | etc. */
  codes?: Record<string, string>;
  /** Insert an extra spacer row between date and code rows. */
  spacerBetweenDateAndCode?: boolean;
}): Worksheet {
  const dowLabels = opts.dowLabels ?? ["S", "M", "T", "W", "T", "F", "S"];
  const grid: Array<Array<CellSpec | string | number | Date | null>> = [];
  // Row 0: month name
  grid.push([opts.monthName, null, null, null, null, null, null]);
  // Row 1: DOW headers
  grid.push(dowLabels);
  // Build day-of-week → date for the given month. Use LOCAL-time Date
  // construction so getFullYear/getMonth/getDate match opts.year/month/day
  // regardless of the test runner's timezone — the parser reads these via
  // local accessors.
  const first = new Date(opts.year, opts.month - 1, 1);
  const firstDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(opts.year, opts.month, 0).getDate();

  let day = 1;
  let dowCursor = firstDow;
  let weekRow: Array<CellSpec | string | number | Date | null> = new Array(7).fill(null);
  const stride = opts.spacerBetweenDateAndCode ? 3 : 2;

  // Local-date ISO formatter (matches what the parser produces).
  const isoLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  while (day <= daysInMonth) {
    weekRow[dowCursor] = new Date(opts.year, opts.month - 1, day);
    if (dowCursor === 6 || day === daysInMonth) {
      grid.push(weekRow);
      // Build code row + optional spacer
      const codeRow: Array<CellSpec | string | number | Date | null> = new Array(7).fill(null);
      for (let dow = 0; dow < 7; dow++) {
        const cell = weekRow[dow];
        if (cell instanceof Date) {
          const iso = isoLocal(cell);
          if (opts.codes?.[iso]) codeRow[dow] = opts.codes[iso];
        }
      }
      if (opts.spacerBetweenDateAndCode) {
        grid.push(new Array(7).fill(null));
      }
      grid.push(codeRow);
      void stride;
      weekRow = new Array(7).fill(null);
      dowCursor = 0;
    } else {
      dowCursor++;
    }
    day++;
  }
  return makeWorksheet(grid);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("extractColorCalendarRanges", () => {
  it("extracts F-coded float days from a standard SMTWTFS layout", () => {
    const ws = buildSingleMonthTab({
      monthName: "January",
      year: 2026,
      month: 1,
      codes: {
        "2026-01-05": "F",
        "2026-01-06": "F",
        "2026-01-07": "F",
        "2026-01-12": "V",
        "2026-01-13": "V",
      },
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.floatDays).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
    expect(result.vacationRanges).toEqual([{ startDate: "2026-01-12", endDate: "2026-01-13" }]);
    expect(result.warnings).toEqual([]);
  });

  it("does NOT treat 'Off' as vacation — only explicit 'V' counts (ambiguous non-working day)", () => {
    const ws = buildSingleMonthTab({
      monthName: "January",
      year: 2026,
      month: 1,
      codes: {
        "2026-01-05": "Off",   // mixed case  → skipped
        "2026-01-06": "OFF",   // upper case  → skipped
        "2026-01-07": "off.",  // trailing dot → skipped
        "2026-01-20": "V",     // a plain V → the only vacation
      },
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    // Off days are ignored; only the explicit V is imported.
    expect(result.vacationRanges).toEqual([
      { startDate: "2026-01-20", endDate: "2026-01-20" },
    ]);
    expect(result.floatDays).toEqual([]);
    const jan = result.diagnostics.find((d) => d.month === 1);
    expect(jan?.vacationCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("ignores numeric 'days worked' tally rows in a 3-row date/code/tally layout (Nanevicz regression)", () => {
    // Some workbooks lay out each week as THREE rows: dates, then codes, then a
    // numeric tally (0 / 0.5 / 1 = days worked). The tally numbers (1..31) must
    // NOT be misread as day-of-month numbers — doing so produced phantom "day 1"
    // entries tagged with whatever code sat two rows below the tally.
    const D = (d: number) => new Date(2026, 0, d); // January 2026 (Jan 1 = Thursday)
    const ws = makeWorksheet([
      ["January", null, null, null, null, null, null],
      ["S", "M", "T", "W", "T", "F", "S"],
      // Week 1: Jan 1 (Thu) .. Jan 3 (Sat)
      [null, null, null, null, D(1), D(2), D(3)],
      [null, null, null, null, "H", "V", null], // Jan 2 = V
      [null, null, null, null, 0, 0, null], //     tally
      // Week 2: Jan 4 (Sun) .. Jan 10 (Sat)
      [D(4), D(5), D(6), D(7), D(8), D(9), D(10)],
      ["_", "W", "W", "Off", "W", "Off", "_"], //  Jan 7 & 9 = Off (ignored, not vacation)
      [0, 1, 1, 0, 1, 0, 0], //                     tally — these 1s sit two rows above week-3 codes
      // Week 3: Jan 11 (Sun) .. Jan 17 (Sat)
      [D(11), D(12), D(13), D(14), D(15), D(16), D(17)],
      ["_", "F", "F", "F", "F", "F", "_"], //       Jan 12-16 = Float
      [0, 1, 1, 1, 1, 1, 0], //                      tally
    ]);
    const result = extractColorCalendarRanges(ws, 2026, xlsx);

    // No phantom "day 1" entries leaking from the tally rows.
    const allDates = [
      ...result.vacationRanges.flatMap((r) => [r.startDate, r.endDate]),
      ...result.floatDays,
    ];
    expect(allDates).not.toContain("2026-01-01");

    expect(result.vacationRanges).toEqual([
      { startDate: "2026-01-02", endDate: "2026-01-02" }, // only the V; Off skipped
    ]);
    expect(result.floatDays).toEqual([
      "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16",
    ]);
    const jan = result.diagnostics.find((d) => d.month === 1);
    expect(jan?.dateCount).toBe(17); // 3 + 7 + 7 real dates, not inflated by tallies
  });

  it("parses the 4-months-across master layout with gap columns + tally rows (Work_Day_Tally regression)", () => {
    // The master "Work_Day_Tally" workbook lays out FOUR months side-by-side in
    // one band, each occupying 7 columns with a 1-column gap between them (the
    // gap holds weekly tally sums). Each week is 3 rows: dates, codes (+1),
    // numeric tally (+2). This locks in:
    //   • side-by-side months are each detected and parsed independently
    //   • the 1-column gaps don't bleed one month's codes into another
    //   • the 1st of each month is read at the correct weekday column
    //   • tally numbers are never misread as day-of-month values
    const Y = 2026;
    // Column starts: Jan=4(E), Feb=12(M), Mar=20(U), Apr=28(AC) — gaps at 11/19/27.
    const monthCols: Record<number, number> = { 1: 4, 2: 12, 3: 20, 4: 28 };
    const monthNames: Record<number, string> = { 1: "January", 2: "February", 3: "March", 4: "April" };
    const WIDTH = 36;
    const grid: Array<Array<CellSpec | string | number | Date | null>> = [];
    const ensureRow = (r: number) => { while (grid.length <= r) grid.push(new Array(WIDTH).fill(null)); };
    const put = (r: number, c: number, v: CellSpec | string | number | Date) => { ensureRow(r); grid[r][c] = v; };

    // Codes per month, keyed by day-of-month.
    const codes: Record<number, Record<number, string>> = {
      1: { 1: "H", 2: "V", 5: "F", 6: "F", 7: "F", 8: "F", 9: "F", 12: "0.5V" }, // Jan 1 = New Year (skip)
      2: { 1: "_", 2: "V", 16: "V" },          // Feb 1 = Sunday (skip), Feb 2/16 = vacation
      3: { 1: "_", 31: "V" },                  // Mar 1 = Sunday (skip), Mar 31 = vacation (month end)
      4: { 1: "W", 6: "F", 7: "F", 30: "V" },  // Apr 1 = Wednesday work (skip)
    };

    const HEADER_ROW = 8;   // band month names
    const DOW_ROW = 10;     // S M T W T F S
    const WEEK_START = 11;   // first date row
    for (const m of [1, 2, 3, 4]) {
      const colStart = monthCols[m];
      put(HEADER_ROW, colStart, monthNames[m]);
      ["S", "M", "T", "W", "T", "F", "S"].forEach((d, i) => put(DOW_ROW, colStart + i, d));
      const first = new Date(Y, m - 1, 1);
      const firstDow = first.getDay();
      const daysInMonth = new Date(Y, m, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dow = (firstDow + day - 1) % 7;
        const week = Math.floor((firstDow + day - 1) / 7);
        const dateRow = WEEK_START + week * 3;
        const col = colStart + dow;
        put(dateRow, col, new Date(Y, m - 1, day)); // date
        const code = codes[m]?.[day];
        if (code) put(dateRow + 1, col, code);       // code (+1)
        put(dateRow + 2, col, code === "F" || code === "V" ? 0 : 1); // tally (+2): numbers must be ignored
      }
    }

    const ws = makeWorksheet(grid);
    const result = extractColorCalendarRanges(ws, Y, xlsx);

    // No phantom day-1 leaks; holidays/work/weekends on the 1st are NOT vacation.
    const allDays = [
      ...result.vacationRanges.flatMap((r) => [r.startDate, r.endDate]),
      ...result.floatDays,
    ];
    expect(allDays).not.toContain("2026-01-01"); // H
    expect(allDays).not.toContain("2026-02-01"); // weekend
    expect(allDays).not.toContain("2026-03-01"); // weekend
    expect(allDays).not.toContain("2026-04-01"); // W

    // Floats from all four months, no cross-month bleed across the gap columns.
    expect(result.floatDays).toEqual([
      "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
      "2026-04-06", "2026-04-07",
    ]);
    // Full vacations (including month-end Mar 31 and the explicit V days).
    expect(result.vacationRanges.filter((r) => !r.halfDay).map((r) => r.startDate)).toEqual([
      "2026-01-02", "2026-02-02", "2026-02-16", "2026-03-31", "2026-04-30",
    ]);
    // Half-day vacation (Jan 12).
    expect(result.vacationRanges.filter((r) => r.halfDay).map((r) => r.startDate)).toEqual([
      "2026-01-12",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("never silently auto-skips — empty results produce a 'no_results' warning (Thakkar regression)", () => {
    // A sheet with month header + DOW row but no codes anywhere
    const ws = buildSingleMonthTab({
      monthName: "March",
      year: 2026,
      month: 3,
      codes: {},
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.floatDays).toEqual([]);
    expect(result.vacationRanges).toEqual([]);
    // CRITICAL: must surface a warning so the UI can highlight the sheet
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.code === "no_results")).toBe(true);
  });

  it("warns when no !ref is present", () => {
    const ws: Worksheet = {};
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.warnings).toEqual([{ code: "no_ref", message: expect.any(String) }]);
  });

  it("warns when no month headers are found", () => {
    const ws = makeWorksheet([
      ["random", "stuff", "here"],
      ["with", "no", "month"],
    ]);
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.warnings.some((w) => w.code === "no_month_headers")).toBe(true);
  });

  it("warns when DOW row can't be found below a month header", () => {
    // Month name but no SMTWTFS row anywhere
    const ws = makeWorksheet([
      ["January"],
      ["foo", "bar", "baz"],
      ["more", "junk"],
    ]);
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.warnings.some((w) => w.code === "dow_row_not_found")).toBe(true);
  });

  it("handles multi-character day-of-week labels (Su/Mo/Tu/We/Th/Fr/Sa)", () => {
    const ws = buildSingleMonthTab({
      monthName: "February",
      year: 2026,
      month: 2,
      dowLabels: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
      codes: { "2026-02-09": "F", "2026-02-10": "F" },
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.floatDays).toEqual(["2026-02-09", "2026-02-10"]);
  });

  it("tolerates F code with trailing whitespace and parenthetical text", () => {
    const ws = buildSingleMonthTab({
      monthName: "April",
      year: 2026,
      month: 4,
      codes: {
        "2026-04-06": "F ",
        "2026-04-07": "F (Mills)",
        "2026-04-08": "F.",
      },
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.floatDays).toEqual(["2026-04-06", "2026-04-07", "2026-04-08"]);
  });

  it("falls back to dateRow+2 when there's a spacer row between date and code", () => {
    const ws = buildSingleMonthTab({
      monthName: "May",
      year: 2026,
      month: 5,
      spacerBetweenDateAndCode: true,
      codes: { "2026-05-04": "F", "2026-05-05": "F" },
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    expect(result.floatDays).toEqual(["2026-05-04", "2026-05-05"]);
    // Diagnostics should reflect that codes were found at the +2 offset
    const may = result.diagnostics.find((d) => d.month === 5);
    expect(may?.codeRowStride).toBe("below_2");
  });

  it("populates per-month diagnostics with date and code counts", () => {
    const ws = buildSingleMonthTab({
      monthName: "June",
      year: 2026,
      month: 6,
      codes: {
        "2026-06-01": "V",
        "2026-06-02": "V",
        "2026-06-15": "F",
      },
    });
    const result = extractColorCalendarRanges(ws, 2026, xlsx);
    const jun = result.diagnostics.find((d) => d.month === 6);
    expect(jun).toBeDefined();
    expect(jun!.dateCount).toBe(30); // all 30 days of June
    expect(jun!.vacationCount).toBe(2);
    expect(jun!.floatCount).toBe(1);
    expect(jun!.dowRow).not.toBeNull();
  });
});

describe("matchPhysicianEmail", () => {
  const users = [
    { email: "thakkar@example.com", physician: { firstName: "Neha", lastName: "Thakkar" } },
    { email: "shah@example.com", physician: { firstName: "Bhavik", lastName: "Shah" } },
    { email: "christoph@example.com", physician: { firstName: "Ian", lastName: "Christoph" } },
  ];

  it("matches a bare last name", () => {
    expect(matchPhysicianEmail("Thakkar", users)).toEqual({
      email: "thakkar@example.com",
      confidence: "exact",
    });
  });

  it('matches "Dr. Thakkar"', () => {
    expect(matchPhysicianEmail("Dr. Thakkar", users)).toEqual({
      email: "thakkar@example.com",
      confidence: "exact",
    });
  });

  it('matches "Thakkar, Neha MD"', () => {
    const r = matchPhysicianEmail("Thakkar, Neha MD", users);
    expect(r.email).toBe("thakkar@example.com");
    expect(["exact", "fuzzy"]).toContain(r.confidence);
  });

  it('matches "Neha Thakkar"', () => {
    expect(matchPhysicianEmail("Neha Thakkar", users).email).toBe("thakkar@example.com");
  });

  it('returns no match for unknown name', () => {
    expect(matchPhysicianEmail("Random Person", users).confidence).toBe("none");
  });

  it("returns ambiguous when multiple last names match the sheet name", () => {
    const ambiguousUsers = [
      ...users,
      { email: "thakkar2@example.com", physician: { firstName: "Other", lastName: "Thakkar" } },
    ];
    const r = matchPhysicianEmail("Thakkar", ambiguousUsers);
    expect(r.confidence).toBe("ambiguous");
    expect(r.email).toBe("");
    expect(r.candidates?.length).toBe(2);
  });
});

describe("daysToRanges (no weekend bridging)", () => {
  it("merges consecutive calendar days into a single range", () => {
    expect(daysToRanges(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"])).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-05" },
    ]);
  });

  it("merges adjacent coded weekend days (Fri/Sat/Sun) since they are consecutive", () => {
    expect(
      daysToRanges(["2026-06-05", "2026-06-06", "2026-06-07"]), // Fri, Sat, Sun
    ).toEqual([{ startDate: "2026-06-05", endDate: "2026-06-07" }]);
  });

  it("does NOT bridge a weekend gap (Fri off + Mon off stay separate)", () => {
    expect(
      daysToRanges([
        "2026-06-05", // Fri
        "2026-06-08", // Mon (Sat/Sun not coded)
      ]),
    ).toEqual([
      { startDate: "2026-06-05", endDate: "2026-06-05" },
      { startDate: "2026-06-08", endDate: "2026-06-08" },
    ]);
  });

  it("does NOT bridge across a weekday gap", () => {
    expect(
      daysToRanges([
        "2026-06-01", // Mon
        "2026-06-03", // Wed (Tue skipped)
      ]),
    ).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-01" },
      { startDate: "2026-06-03", endDate: "2026-06-03" },
    ]);
  });

  it("isNextCalendarDay: adjacent vs gapped", () => {
    expect(isNextCalendarDay("2026-06-05", "2026-06-06")).toBe(true); // Fri→Sat
    expect(isNextCalendarDay("2026-06-05", "2026-06-08")).toBe(false); // Fri→Mon
    expect(isNextCalendarDay("2026-06-30", "2026-07-01")).toBe(true); // month boundary
  });
});
