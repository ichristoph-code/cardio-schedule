// Diagnostic: dump the raw cell grid + parser output for specific sheets/months
// so we can see exactly how date cells align with their code cells.
//
// Usage:
//   npx tsx scripts/debug-parse.ts <path-to-workbook.xlsx> [sheetNameSubstr] [month1,month2,...]
//
// Example:
//   npx tsx scripts/debug-parse.ts tmp/2026.xlsx Nanevicz 1,11
//
// The workbook is read with the SAME options the app uses.

import * as XLSX from "xlsx";
import {
  extractColorCalendarRanges,
  detectYearFromWorkbook,
} from "../src/lib/excel-vacation-parser";

const [, , file, sheetFilter, monthsArg] = process.argv;
if (!file) {
  console.error("Provide a workbook path. See header for usage.");
  process.exit(1);
}

const wantedMonths = (monthsArg ?? "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n >= 1 && n <= 12);

const wb = XLSX.read(require("fs").readFileSync(file), {
  cellDates: true,
  cellStyles: true,
});

const year = detectYearFromWorkbook(wb as never, XLSX as never);
console.log(`Detected year: ${year}`);

for (const sheetName of wb.SheetNames) {
  if (/template|legend|key|example/i.test(sheetName)) continue;
  if (sheetFilter && !sheetName.toLowerCase().includes(sheetFilter.toLowerCase())) continue;

  const ws = wb.Sheets[sheetName];
  console.log(`\n===== SHEET: ${sheetName} =====`);
  if (ws["!merges"]?.length) {
    console.log(`merges: ${JSON.stringify(ws["!merges"])}`);
  }

  const result = extractColorCalendarRanges(ws as never, year, XLSX as never);
  console.log("floatDays:", result.floatDays.join(", ") || "(none)");
  console.log(
    "vacationRanges:",
    result.vacationRanges
      .map((r) => (r.startDate === r.endDate ? r.startDate + (r.halfDay ? "(½)" : "") : `${r.startDate}..${r.endDate}`))
      .join(", ") || "(none)",
  );
  console.log("diagnostics:", JSON.stringify(result.diagnostics.filter((d) => !wantedMonths.length || wantedMonths.includes(d.month))));
  console.log("warnings:", JSON.stringify(result.warnings));

  // Raw cell dump around each wanted month so we can eyeball date/code alignment.
  const ref = ws["!ref"];
  if (!ref || !wantedMonths.length) continue;
  const range = XLSX.utils.decode_range(ref);
  for (const wantMonth of wantedMonths) {
    console.log(`\n--- raw cells (month ${wantMonth}) ---`);
    for (let r = 0; r <= range.e.r; r++) {
      const cells: string[] = [];
      let hasContent = false;
      for (let c = 0; c <= Math.min(range.e.c, 12); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v == null || cell.v === "") {
          cells.push("·".padEnd(10));
          continue;
        }
        hasContent = true;
        const v = cell.v;
        const repr =
          v instanceof Date
            ? `D:${v.getFullYear()}-${v.getMonth() + 1}-${v.getDate()}`
            : `${cell.t}:${String(v)}`;
        cells.push(repr.slice(0, 10).padEnd(10));
      }
      if (hasContent) console.log(`r${String(r).padStart(2)} ${cells.join("")}`);
    }
  }
}
