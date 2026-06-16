/**
 * Excel vacation/float parser.
 *
 * Walks a multi-tab annual calendar (one tab per physician) and extracts:
 *  - Vacation date ranges (cells marked "V" / "OFF" or red-highlighted)
 *  - Half-day vacations ("0.5V")
 *  - Hospital Float days ("F")
 *
 * Design goals after the "Thakkar silent skip" incident:
 *  1. NEVER silently return zero — every early-return is recorded as a
 *     diagnostic that callers MUST surface to the user.
 *  2. Tolerate layout variation: multi-character day labels (Su/Mo/Tu/Th/Sa),
 *     wider DOW row search window, code-cell at dateRow+1 OR dateRow+2.
 *  3. Be unit-testable without a DOM: takes the XLSX module as a parameter.
 */

// Minimal XLSX type surface — we only use these helpers/properties.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type XLSXLike = {
  utils: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } };
    encode_cell: (addr: { r: number; c: number }) => string;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Worksheet = Record<string, any> & { "!ref"?: string };

export interface DateRange {
  startDate: string;
  endDate: string;
  halfDay?: string;
}

export interface ParserWarning {
  /** Machine-readable code so callers can filter / categorize. */
  code:
    | "no_ref"
    | "no_month_headers"
    | "dow_row_not_found"
    | "no_dates_in_month"
    | "no_results";
  /** Human-readable explanation suitable for surfacing in the UI. */
  message: string;
  /** Optional month (1-12) the warning refers to. */
  month?: number;
}

export interface MonthDiagnostic {
  month: number;
  headerRow: number;
  headerCol: number;
  dowRow: number | null;
  /** "1+" / "1+2" describes which row offsets below a date contained the code. */
  codeRowStride: "below_1" | "below_2" | "mixed" | "none";
  dateCount: number;
  vacationCount: number;
  halfCount: number;
  floatCount: number;
  redOnlyCount: number;
}

export interface CalendarRanges {
  vacationRanges: DateRange[];
  floatDays: string[];
  warnings: ParserWarning[];
  diagnostics: MonthDiagnostic[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MONTH_NAMES_LC = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

const MONTH_ABBREVS_LC = [
  "jan","feb","mar","apr","may","jun",
  "jul","aug","sep","oct","nov","dec",
];

/**
 * Day-of-week labels we accept. Matched case-insensitive, with leading
 * whitespace stripped. Both single-char ("S","M","T","W","F") and two-char
 * ("Su","Mo","Tu","We","Th","Fr","Sa") variants are accepted; "Mon"/"Tue"
 * etc. also match via startsWith.
 */
const DOW_LABELS: Array<{ label: string; idx: number }> = [
  // idx 0=Sun..6=Sat — used to find the Sunday column
  { label: "SU", idx: 0 }, { label: "S", idx: 0 },
  { label: "MO", idx: 1 }, { label: "M", idx: 1 },
  { label: "TU", idx: 2 }, { label: "T", idx: 2 },
  { label: "WE", idx: 3 }, { label: "W", idx: 3 },
  { label: "TH", idx: 4 },
  { label: "FR", idx: 5 }, { label: "F", idx: 5 },
  { label: "SA", idx: 6 },
];

function classifyDow(raw: string): number | null {
  // Strip non-letters, take first 2 chars, upper-case.
  const cleaned = raw.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  if (cleaned.length === 0) return null;
  // Prefer 2-char match (avoids "S" ambiguity for Sat/Sun, "T" for Tue/Thu)
  for (const d of DOW_LABELS) {
    if (d.label.length === 2 && d.label === cleaned) return d.idx;
  }
  for (const d of DOW_LABELS) {
    if (d.label.length === 1 && d.label === cleaned[0]) return d.idx;
  }
  return null;
}

// ─── Color helpers ──────────────────────────────────────────────────────────

export function isVacationRed(rgb: string | undefined): boolean {
  if (!rgb || rgb.length < 6) return false;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r > 150 && g < 100 && b < 100;
}

export function getCellRgb(cell: Record<string, unknown> | undefined): string | undefined {
  if (!cell) return undefined;
  const s = cell.s as Record<string, unknown> | undefined;
  if (!s) return undefined;
  const fg = s.fgColor as Record<string, unknown> | undefined;
  const bg = s.bgColor as Record<string, unknown> | undefined;
  return (fg?.rgb as string) ?? (bg?.rgb as string);
}

// ─── Date helpers ───────────────────────────────────────────────────────────

/** True when `nextStr` is the calendar day immediately after `prevStr`. */
export function isNextCalendarDay(prevStr: string, nextStr: string): boolean {
  const d = new Date(prevStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  const next =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return next === nextStr;
}

export function daysToRanges(sortedDays: string[]): Array<{ startDate: string; endDate: string }> {
  if (sortedDays.length === 0) return [];
  const ranges: [string, string][] = [];
  for (const d of sortedDays) {
    if (ranges.length === 0) { ranges.push([d, d]); continue; }
    const last = ranges[ranges.length - 1];
    // Only merge truly consecutive calendar days. Weekend gaps are NOT bridged:
    // an off day on Friday and another on Monday stay as two separate ranges so
    // the intervening Sat/Sun aren't marked as vacation. (Consecutive coded
    // Fri/Sat/Sun days still merge normally, since they're adjacent.)
    if (isNextCalendarDay(last[1], d)) {
      last[1] = d;
    } else {
      ranges.push([d, d]);
    }
  }
  return ranges.map(([s, e]) => ({ startDate: s, endDate: e }));
}

// ─── Code normalization ─────────────────────────────────────────────────────

/**
 * Normalize a cell's value into a canonical code or "". Strips whitespace,
 * punctuation, and trailing parenthetical notes. Accepts e.g. "F", "F.",
 * "F\n(Mills)", " f ", "0.5 V".
 */
function normalizeCode(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).toUpperCase();
  // Strip after first newline or open-paren (handles "F (Mills)" / "F\nMills")
  const truncated = s.split(/[\n(]/)[0];
  // Keep alnum + decimal point only
  const cleaned = truncated.replace(/[^A-Z0-9.]/g, "");
  return cleaned;
}

function codeKind(code: string): "FULL" | "HALF" | "FLOAT" | null {
  if (code === "V" || code === "OFF" || code === "V." || code === "OFF.") return "FULL";
  if (code === "0.5V" || code === ".5V") return "HALF";
  if (code === "F" || code === "F." || code === "FL") return "FLOAT";
  return null;
}

// ─── Year detection ─────────────────────────────────────────────────────────

export function detectYearFromWorkbook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wb: { SheetNames: string[]; Sheets: Record<string, any> },
  xlsx: XLSXLike,
): number {
  const thisYear = new Date().getFullYear();
  // Prefer years derived from month-header Date cells (most reliable).
  const dateYears: number[] = [];
  for (const sheetName of wb.SheetNames) {
    if (/template|legend|key|example/i.test(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const ref = ws["!ref"];
    if (!ref) continue;
    const range = xlsx.utils.decode_range(ref);
    for (let r = 0; r <= range.e.r; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[xlsx.utils.encode_cell({ r, c })];
        if (!cell) continue;
        const v = cell.v;
        if (v instanceof Date && v.getDate() === 1) {
          const y = v.getFullYear();
          if (y >= 2020 && y <= 2040) dateYears.push(y);
        }
      }
    }
  }
  if (dateYears.length > 0) {
    // Modal year (handles a stray Dec→Jan boundary cell)
    const counts = new Map<number, number>();
    for (const y of dateYears) counts.set(y, (counts.get(y) ?? 0) + 1);
    let best = dateYears[0]; let bestN = 0;
    for (const [y, n] of counts) if (n > bestN) { best = y; bestN = n; }
    return best;
  }
  // Fallback: bare numeric or "20xx" string near the top of any sheet.
  for (const pass of [0, 1]) {
    for (const sheetName of wb.SheetNames) {
      if (/template|legend|key|example/i.test(sheetName)) continue;
      const ws = wb.Sheets[sheetName];
      const ref = ws["!ref"];
      if (!ref) continue;
      const range = xlsx.utils.decode_range(ref);
      for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
        for (let c = 0; c <= Math.min(range.e.c, 15); c++) {
          const cell = ws[xlsx.utils.encode_cell({ r, c })];
          if (!cell) continue;
          const v = cell.v;
          if (pass === 0 && typeof v === "number" && v >= 2020 && v <= 2040) return v;
          if (pass === 1 && typeof v === "string") {
            const m = v.trim().match(/^(20\d{2})$/);
            if (m) return parseInt(m[1]);
          }
        }
      }
    }
  }
  return thisYear + 1;
}

// ─── Sheet classification ───────────────────────────────────────────────────

export function isColorCalendarSheet(ws: Worksheet, xlsx: XLSXLike): boolean {
  const ref = ws["!ref"];
  if (!ref) return false;
  const range = xlsx.utils.decode_range(ref);

  let monthCount = 0;
  let vacationIndicators = 0;
  for (let r = 0; r <= Math.min(range.e.r, 60); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const val = String(cell.v ?? "").toLowerCase().trim();
      if (MONTH_NAMES_LC.includes(val)) monthCount++;
      // Also count month-header Date cells (xlsx cellDates:true workbooks)
      if (cell.v instanceof Date && cell.v.getDate() === 1) monthCount++;
      if (val === "v" || val === "0.5v" || val === "off" || val === "f") vacationIndicators++;
      if (isVacationRed(getCellRgb(cell as Record<string, unknown>))) vacationIndicators++;
    }
  }
  return monthCount >= 3 && vacationIndicators > 0;
}

// ─── Main extractor ─────────────────────────────────────────────────────────

interface MonthHeader { month: number; row: number; col: number }

function findMonthHeaders(ws: Worksheet, xlsx: XLSXLike): MonthHeader[] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = xlsx.utils.decode_range(ref);
  const raw: MonthHeader[] = [];
  for (let r = 0; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[xlsx.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (cell.v instanceof Date) {
        if (cell.v.getDate() === 1) {
          raw.push({ month: cell.v.getMonth() + 1, row: r, col: c });
        }
        continue;
      }
      const val = String(cell.v ?? "").toLowerCase().trim();
      const exactIdx = MONTH_NAMES_LC.indexOf(val);
      if (exactIdx >= 0) { raw.push({ month: exactIdx + 1, row: r, col: c }); continue; }
      const abbrevIdx = MONTH_ABBREVS_LC.findIndex(a => val.startsWith(a));
      if (abbrevIdx >= 0) raw.push({ month: abbrevIdx + 1, row: r, col: c });
    }
  }
  // Deduplicate by month: keep the topmost-leftmost header per month. A Date
  // cell with day=1 that's actually inside the grid (e.g. Jan 1 in row 3)
  // would otherwise be treated as a second "header" and produce a spurious
  // dow_row_not_found warning.
  const byMonth = new Map<number, MonthHeader>();
  for (const h of raw) {
    const prev = byMonth.get(h.month);
    if (!prev || h.row < prev.row || (h.row === prev.row && h.col < prev.col)) {
      byMonth.set(h.month, h);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * Look for the day-of-week header row for a given month-header cell.
 * Searches up to 10 rows below and 15 columns to the right. Returns the
 * row index and the column of the Sunday cell, or null if not found.
 *
 * We require ≥6 DISTINCT day labels (Sun..Sat minus one is fine, but we
 * don't want 5 stray "M" cells to falsely qualify).
 */
function findDowRow(
  ws: Worksheet,
  xlsx: XLSXLike,
  hdr: MonthHeader,
  maxRow: number,
  maxCol: number,
): { dowRow: number; colStart: number } | null {
  for (let dr = 1; dr <= 10; dr++) {
    const testRow = hdr.row + dr;
    if (testRow > maxRow) break;
    const seen = new Set<number>();
    let totalHits = 0;
    let sunCol = -1;
    for (let c = Math.max(0, hdr.col); c <= Math.min(hdr.col + 15, maxCol); c++) {
      const cell = ws[xlsx.utils.encode_cell({ r: testRow, c })];
      if (!cell) continue;
      const idx = classifyDow(String(cell.v ?? ""));
      if (idx === null) continue;
      seen.add(idx);
      totalHits++;
      if (idx === 0 && sunCol < 0) sunCol = c;
    }
    // Classic single-letter SMTWTFS yields 5 distinct (S/M/T/W/F) with 7 total
    // hits. Multi-char "Su Mo Tu We Th Fr Sa" yields 7 distinct with 7 hits.
    // Require both signals to avoid 5 stray "M" cells qualifying.
    if (seen.size >= 5 && totalHits >= 6) {
      return { dowRow: testRow, colStart: sunCol >= 0 ? sunCol : hdr.col };
    }
  }
  return null;
}

export function extractColorCalendarRanges(
  ws: Worksheet,
  year: number,
  xlsx: XLSXLike,
): CalendarRanges {
  const warnings: ParserWarning[] = [];
  const diagnostics: MonthDiagnostic[] = [];

  const ref = ws["!ref"];
  if (!ref) {
    warnings.push({ code: "no_ref", message: "Sheet has no data range (!ref missing)" });
    return { vacationRanges: [], floatDays: [], warnings, diagnostics };
  }
  const range = xlsx.utils.decode_range(ref);
  const maxRow = range.e.r;
  const maxCol = range.e.c;

  const headers = findMonthHeaders(ws, xlsx);
  if (headers.length === 0) {
    warnings.push({
      code: "no_month_headers",
      message: "No month names or date headers found. Expected cells like \"January\", \"Jan 2026\", or date cells where day=1.",
    });
    return { vacationRanges: [], floatDays: [], warnings, diagnostics };
  }

  const fullDays: string[] = [];
  const halfDays: string[] = [];
  const floatDays: string[] = [];

  for (const hdr of headers) {
    const dow = findDowRow(ws, xlsx, hdr, maxRow, maxCol);
    if (!dow) {
      warnings.push({
        code: "dow_row_not_found",
        month: hdr.month,
        message: `Month ${hdr.month}: could not find day-of-week header row (S M T W T F S or Su Mo Tu We Th Fr Sa) within 10 rows of the month name.`,
      });
      diagnostics.push({
        month: hdr.month,
        headerRow: hdr.row,
        headerCol: hdr.col,
        dowRow: null,
        codeRowStride: "none",
        dateCount: 0,
        vacationCount: 0,
        halfCount: 0,
        floatCount: 0,
        redOnlyCount: 0,
      });
      continue;
    }

    const monthDiag: MonthDiagnostic = {
      month: hdr.month,
      headerRow: hdr.row,
      headerCol: hdr.col,
      dowRow: dow.dowRow,
      codeRowStride: "none",
      dateCount: 0,
      vacationCount: 0,
      halfCount: 0,
      floatCount: 0,
      redOnlyCount: 0,
    };
    let codeFoundBelow1 = 0;
    let codeFoundBelow2 = 0;

    // Detect whether this month's grid uses real Date-typed day cells. Some
    // workbooks lay out each week as THREE rows — dates, codes, then a numeric
    // "days worked" tally row (0 / 0.5 / 1). Those tally numbers are 1..31 and
    // would otherwise be misread as day-of-month numbers, corrupting the output
    // (e.g. every "1" tally becomes a phantom "day 1"). When Date cells are
    // present we trust only them and ignore bare numbers in the grid.
    let monthUsesDateCells = false;
    for (let dr = 1; dr <= 16 && !monthUsesDateCells; dr++) {
      const rr = dow.dowRow + dr;
      if (rr > maxRow) break;
      for (let dowIdx = 0; dowIdx < 7; dowIdx++) {
        const cc = dow.colStart + dowIdx;
        if (cc > maxCol) break;
        const v = ws[xlsx.utils.encode_cell({ r: rr, c: cc })]?.v;
        if (v instanceof Date && v.getFullYear() === year && v.getMonth() + 1 === hdr.month) {
          monthUsesDateCells = true;
          break;
        }
      }
    }

    for (let dr = 1; dr <= 16; dr++) {
      const dateRow = dow.dowRow + dr;
      if (dateRow > maxRow) break;

      for (let dowIdx = 0; dowIdx < 7; dowIdx++) {
        const c = dow.colStart + dowIdx;
        if (c > maxCol) break;
        const cell = ws[xlsx.utils.encode_cell({ r: dateRow, c })];
        if (!cell) continue;

        const val = cell.v;
        let dayNum: number | null = null;
        if (val instanceof Date) {
          if (val.getFullYear() === year && val.getMonth() + 1 === hdr.month) {
            dayNum = val.getDate();
          }
        } else if (!monthUsesDateCells && typeof val === "number" && val >= 1 && val <= 31) {
          dayNum = Math.round(val);
        }
        if (dayNum === null) continue;

        monthDiag.dateCount++;
        const mm = String(hdr.month).padStart(2, "0");
        const dd = String(dayNum).padStart(2, "0");
        const dateStr = `${year}-${mm}-${dd}`;

        // Look for the code at dateRow+1 first, then dateRow+2 as fallback
        // (some sheets use a spacer row between date and code).
        let code = "";
        const below1 = ws[xlsx.utils.encode_cell({ r: dateRow + 1, c })];
        const code1 = normalizeCode(below1?.v);
        if (codeKind(code1)) {
          code = code1;
          codeFoundBelow1++;
        } else {
          const below2 = ws[xlsx.utils.encode_cell({ r: dateRow + 2, c })];
          const code2 = normalizeCode(below2?.v);
          if (codeKind(code2)) {
            code = code2;
            codeFoundBelow2++;
          }
        }

        const kind = codeKind(code);
        if (kind === "FULL") {
          fullDays.push(dateStr);
          monthDiag.vacationCount++;
        } else if (kind === "HALF") {
          halfDays.push(dateStr);
          monthDiag.halfCount++;
        } else if (kind === "FLOAT") {
          floatDays.push(dateStr);
          monthDiag.floatCount++;
        } else {
          // Fallback: color detection for red-highlighted cells
          const rgb = getCellRgb(cell as Record<string, unknown>);
          if (isVacationRed(rgb)) {
            fullDays.push(dateStr);
            monthDiag.redOnlyCount++;
          }
        }
      }
    }

    if (codeFoundBelow1 > 0 && codeFoundBelow2 === 0) monthDiag.codeRowStride = "below_1";
    else if (codeFoundBelow1 === 0 && codeFoundBelow2 > 0) monthDiag.codeRowStride = "below_2";
    else if (codeFoundBelow1 > 0 && codeFoundBelow2 > 0) monthDiag.codeRowStride = "mixed";

    if (monthDiag.dateCount === 0) {
      warnings.push({
        code: "no_dates_in_month",
        month: hdr.month,
        message: `Month ${hdr.month}: DOW row found at row ${dow.dowRow + 1} but no date cells matched ${year}-${String(hdr.month).padStart(2, "0")}-XX in the 16 rows below.`,
      });
    }

    diagnostics.push(monthDiag);
  }

  const uniqueFull = [...new Set(fullDays)].sort();
  const vacationRanges: DateRange[] = daysToRanges(uniqueFull);

  for (const d of [...new Set(halfDays)].sort()) {
    vacationRanges.push({ startDate: d, endDate: d, halfDay: "MORNING" });
  }

  const uniqueFloat = [...new Set(floatDays)].sort();

  if (vacationRanges.length === 0 && uniqueFloat.length === 0) {
    warnings.push({
      code: "no_results",
      message: "Parser found 0 vacation days and 0 float days. Either this physician has no entries OR the sheet layout doesn't match expectations — check diagnostics below.",
    });
  }

  return {
    vacationRanges,
    floatDays: uniqueFloat,
    warnings,
    diagnostics,
  };
}

// ─── Physician email matching ───────────────────────────────────────────────

export interface PhysicianUserLite {
  email: string;
  physician?: { firstName: string; lastName: string } | null;
}

const TITLE_SUFFIXES = /\b(MD|DO|PhD|MBBS|FACC|FACP)\b\.?/gi;
const TITLE_PREFIXES = /^(dr\.?\s+|mr\.?\s+|ms\.?\s+|mrs\.?\s+)/i;

function normalizeNameForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(TITLE_SUFFIXES, "")
    .replace(TITLE_PREFIXES, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NameMatchResult {
  email: string;
  /** "exact" = unambiguous, "fuzzy" = lastname-only match, "ambiguous" = >1 candidate */
  confidence: "exact" | "fuzzy" | "ambiguous" | "none";
  /** When ambiguous, the candidate emails so the UI can prompt. */
  candidates?: string[];
}

export function matchPhysicianEmail(
  sheetName: string,
  users: PhysicianUserLite[],
): NameMatchResult {
  const norm = normalizeNameForMatch(sheetName);
  if (!norm) return { email: "", confidence: "none" };

  const exactMatches: PhysicianUserLite[] = [];
  const fuzzyMatches: PhysicianUserLite[] = [];

  for (const u of users) {
    if (!u.physician) continue;
    const fn = u.physician.firstName.toLowerCase();
    const ln = u.physician.lastName.toLowerCase();
    const tokens = norm.split(" ");
    const hasLast = tokens.includes(ln) || tokens.some(t => ln.split("-").includes(t));
    const hasFirst = tokens.includes(fn) || (fn.length > 0 && tokens.some(t => t === fn[0]));

    if (norm === ln || norm === fn || norm === `${fn} ${ln}` || norm === `${ln} ${fn}`) {
      exactMatches.push(u);
    } else if (hasLast && hasFirst) {
      exactMatches.push(u);
    } else if (hasLast) {
      fuzzyMatches.push(u);
    }
  }

  if (exactMatches.length === 1) return { email: exactMatches[0].email, confidence: "exact" };
  if (exactMatches.length > 1) {
    return {
      email: "",
      confidence: "ambiguous",
      candidates: exactMatches.map(u => u.email),
    };
  }
  if (fuzzyMatches.length === 1) return { email: fuzzyMatches[0].email, confidence: "fuzzy" };
  if (fuzzyMatches.length > 1) {
    return {
      email: "",
      confidence: "ambiguous",
      candidates: fuzzyMatches.map(u => u.email),
    };
  }
  return { email: "", confidence: "none" };
}
