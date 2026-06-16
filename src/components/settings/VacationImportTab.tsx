"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, XCircle, SkipForward, ImageIcon, AlertTriangle } from "lucide-react";
import {
  extractColorCalendarRanges,
  detectYearFromWorkbook,
  matchPhysicianEmail,
  isNextCalendarDay,
  type DateRange,
  type ParserWarning,
  type MonthDiagnostic,
  type PhysicianUserLite,
} from "@/lib/excel-vacation-parser";

// ─── Date helpers (legacy grid format only) ──────────────────────────────────

function toISODateStr(val: unknown): string | null {
  if (val instanceof Date) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
    const parsed = new Date(s);
    if (!isNaN(parsed.valueOf())) return toISODateStr(parsed);
  }
  return null;
}

// Color-calendar parser lives in src/lib/excel-vacation-parser.ts (testable).
// Legacy grid-format parsing remains inline below.

// ─── Legacy grid format (V codes) ───────────────────────────────────────────

const GRID_LEGEND_CODES = new Set(["V", "OFF", "W", "H", "F", "_", "Call", "0.5V", "1.5W"]);
const GRID_MONTH_COLS = [
  [4, 5, 6, 7, 8, 9, 10],
  [12, 13, 14, 15, 16, 17, 18],
  [20, 21, 22, 23, 24, 25, 26],
  [28, 29, 30, 31, 32, 33, 34],
];

function isCalendarGridFormat(rows: unknown[][]): boolean {
  let matches = 0;
  for (const row of rows.slice(0, 25)) {
    const r = row as unknown[];
    if (typeof r[1] === "string" && GRID_LEGEND_CODES.has(r[1].trim())) matches++;
    if (matches >= 3) return true;
  }
  return false;
}

function extractCalendarGridRanges(rows: unknown[][]): string[] {
  const fullDays: string[] = [];
  const halfDays: string[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i] as unknown[];
    const nextRow = rows[i + 1] as unknown[];
    const hasDate = GRID_MONTH_COLS.some((cols) => cols.some((c) => row[c] instanceof Date));
    if (!hasDate) continue;
    for (const cols of GRID_MONTH_COLS) {
      for (const c of cols) {
        const ds = toISODateStr(row[c]);
        const code =
          typeof nextRow[c] === "string"
            ? (nextRow[c] as string).trim().toUpperCase()
            : null;
        if (ds && (code === "V" || code === "OFF")) fullDays.push(ds);
        if (ds && code === "0.5V") halfDays.push(ds);
      }
    }
  }

  const result: string[] = [];

  // Full vacation days: merge only truly consecutive calendar days into ranges
  // (weekend gaps are not bridged).
  if (fullDays.length > 0) {
    fullDays.sort();
    const ranges: [string, string][] = [];
    for (const d of fullDays) {
      if (ranges.length === 0) { ranges.push([d, d]); continue; }
      const last = ranges[ranges.length - 1];
      if (isNextCalendarDay(last[1], d)) { last[1] = d; } else { ranges.push([d, d]); }
    }
    result.push(...ranges.map(([s, e]) => (s === e ? s : `${s},${e}`)));
  }

  // Half vacation days (0.5V): always single-day, encoded as YYYY-MM-DD,YYYY-MM-DD,,MORNING
  for (const d of halfDays.sort()) {
    result.push(`${d},${d},,MORNING`);
  }

  return result;
}

// ─── Text range parser ────────────────────────────────────────────────────────

const PLACEHOLDER = `# One range per line:
#   YYYY-MM-DD                             (single full day)
#   YYYY-MM-DD,YYYY-MM-DD                  (range)
#   YYYY-MM-DD,YYYY-MM-DD,reason           (range with reason)
#   YYYY-MM-DD,YYYY-MM-DD,,MORNING         (half day — AM)
#   YYYY-MM-DD,YYYY-MM-DD,reason,AFTERNOON (half day — PM)
2026-07-13,2026-07-17,Beach trip
2026-08-05,2026-08-07
2026-09-04
2026-09-10,2026-09-10,,MORNING`;

function parseRanges(raw: string) {
  const ok: Array<{ startDate: string; endDate: string; reason?: string; halfDay?: string }> = [];
  const errors: string[] = [];
  for (const [i, rawLine] of raw.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(",").map((p) => p.trim());
    const start = parts[0];
    const end = parts[1] || parts[0];
    // If 4th field is MORNING or AFTERNOON, treat it as halfDay and parts[2] as reason.
    // Otherwise join everything from index 2 as reason (handles commas in reason text).
    const halfDayCandidate = parts[3]?.toUpperCase();
    const isHalfDay = halfDayCandidate === "MORNING" || halfDayCandidate === "AFTERNOON";
    const reason = isHalfDay
      ? (parts[2] || undefined)
      : (parts.slice(2).join(",").trim() || undefined);
    const halfDay = isHalfDay ? halfDayCandidate : undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      errors.push(`Line ${i + 1}: invalid date \`${line}\``);
      continue;
    }
    ok.push({ startDate: start, endDate: end, reason, halfDay });
  }
  return { ok, errors };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RowResult =
  | { startDate: string; endDate: string; status: "created" | "would-create" }
  | { startDate: string; endDate: string; status: "skipped"; reason: string }
  | { startDate: string; endDate: string; status: "error"; error: string };

interface ImportResponse {
  physicianEmail: string;
  physicianId: string;
  dryRun: boolean;
  defaultStatus: "APPROVED" | "PENDING";
  replaceExisting?: boolean;
  replaced?: number;
  counts: { created: number; skipped: number; errors: number; total: number };
  results: RowResult[];
}

interface FloatImportResponse {
  physicianEmail: string;
  dryRun: boolean;
  replaceExisting?: boolean;
  replaced?: number;
  counts: { created: number; skipped: number; errors: number; total: number };
  results: Array<{ date: string; status: string; reason?: string; error?: string }>;
}

interface SheetEntry {
  sheetName: string;
  ranges: DateRange[];
  floatDays: string[];
  physicianEmail: string;
  emailMatched: boolean;   // true = auto-matched from physician list
  emailAmbiguous?: boolean;
  emailCandidates?: string[];
  skip: boolean;
  /** Parser warnings — surfaced in the UI so silent zero-results can't slip through. */
  warnings: ParserWarning[];
  diagnostics: MonthDiagnostic[];
  /** Whether the user has expanded the diagnostics panel for this sheet. */
  showDiagnostics?: boolean;
  result?: ImportResponse;
  floatResult?: FloatImportResponse;
  importing?: boolean;
}

type PhysicianUser = PhysicianUserLite;

// ─── Image resize helper ─────────────────────────────────────────────────────

function resizeImageToBlob(file: File, maxPx: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VacationImportTab() {
  // Manual mode state
  const [physicianEmail, setPhysicianEmail] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<"APPROVED" | "PENDING">("APPROVED");
  const [dryRun, setDryRun] = useState(true);
  const [rangesText, setRangesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // Color-calendar mode state
  const [sheets, setSheets] = useState<SheetEntry[] | null>(null);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear() + 1);
  const [bulkDryRun, setBulkDryRun] = useState(true);
  const [bulkReplace, setBulkReplace] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);

  // Image upload mode state
  const [imageRanges, setImageRanges] = useState<DateRange[] | null>(null);
  const [imageYear, setImageYear] = useState<number>(new Date().getFullYear() + 1);
  const [imageEmail, setImageEmail] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageImporting, setImageImporting] = useState(false);
  const [imageResult, setImageResult] = useState<ImportResponse | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const [fileLoading, setFileLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  // ── Image (photo) upload ────────────────────────────────────────────────────

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageLoading(true);
    setImageRanges(null);
    setImageResult(null);
    try {
      // Resize client-side to stay under Anthropic's 5MB base64 limit
      const resizedBlob = await resizeImageToBlob(file, 2400, 0.82);
      const form = new FormData();
      form.append("image", resizedBlob, "calendar.jpg");
      const res = await fetch("/api/admin/vacation-extract-from-image", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      setImageRanges(json.ranges as DateRange[]);
      setImageYear(json.year as number);
      const totalDays = (json.ranges as DateRange[]).reduce((n: number, r: DateRange) => {
        const s = new Date(r.startDate + "T12:00:00");
        const e2 = new Date(r.endDate + "T12:00:00");
        return n + Math.round((e2.getTime() - s.getTime()) / 86400000) + 1;
      }, 0);
      toast.success(`Extracted ${totalDays} vacation days from image`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract from image");
    } finally {
      setImageLoading(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleImageImport(dry: boolean) {
    if (!imageRanges || imageRanges.length === 0) return;
    if (!imageEmail.trim()) { toast.error("Physician email required"); return; }
    setImageImporting(true);
    setImageResult(null);
    try {
      const res = await fetch("/api/admin/vacation-bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicianEmail: imageEmail.trim(),
          ranges: imageRanges,
          defaultStatus,
          dryRun: dry,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setImageResult(json as ImportResponse);
      toast.success(
        dry
          ? `Would create ${json.counts.created}, skip ${json.counts.skipped}`
          : `Created ${json.counts.created}, skipped ${json.counts.skipped}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setImageImporting(false);
    }
  }

  // ── Color-calendar file upload ──────────────────────────────────────────────

  async function handleColorCalendarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setSheets(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: true });
      const year = detectYearFromWorkbook(wb, XLSX);
      setCalYear(year);

      // Fetch physician list for auto-matching sheet names to emails
      let physicianUsers: PhysicianUser[] = [];
      try {
        const usersRes = await fetch("/api/users");
        if (usersRes.ok) physicianUsers = await usersRes.json();
      } catch { /* silently ignore — user can fill manually */ }

      const entries: SheetEntry[] = [];
      let warningCount = 0;
      for (const sheetName of wb.SheetNames) {
        // Skip legend / template sheets
        if (/template|legend|key|example/i.test(sheetName)) continue;
        const ws = wb.Sheets[sheetName];
        const { vacationRanges, floatDays, warnings, diagnostics } =
          extractColorCalendarRanges(ws, year, XLSX);
        const match = matchPhysicianEmail(sheetName, physicianUsers);
        if (warnings.length > 0) warningCount++;
        entries.push({
          sheetName,
          ranges: vacationRanges,
          floatDays,
          physicianEmail: match.email,
          emailMatched: match.confidence === "exact" || match.confidence === "fuzzy",
          emailAmbiguous: match.confidence === "ambiguous",
          emailCandidates: match.candidates,
          // IMPORTANT: do NOT auto-skip on empty results — that's the bug that
          // hid Thakkar's floats. Default `skip` to false; the UI shows a red
          // warning badge and the user must explicitly tick the skip checkbox
          // to exclude the sheet.
          skip: false,
          warnings,
          diagnostics,
        });
      }

      if (entries.length === 0) {
        toast.error("No physician sheets found in this file");
        return;
      }

      setSheets(entries);
      if (warningCount > 0) {
        toast.warning(
          `Detected ${entries.length} sheets for ${year} — ${warningCount} had parser warnings. Review highlighted rows below.`,
        );
      } else {
        toast.success(`Detected ${entries.length} physician sheets for ${year}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setFileLoading(false);
      if (e.target) e.target.value = "";
    }
  }

  async function importSheet(
    idx: number,
    dry: boolean,
  ): Promise<{ vacResult: ImportResponse | null; floatResult: FloatImportResponse | null }> {
    const entry = sheets![idx];
    if (!entry.physicianEmail.trim()) {
      toast.error(`Enter email for ${entry.sheetName}`);
      return { vacResult: null, floatResult: null };
    }

    let vacResult: ImportResponse | null = null;
    if (entry.ranges.length > 0) {
      const res = await fetch("/api/admin/vacation-bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicianEmail: entry.physicianEmail.trim(),
          ranges: entry.ranges,
          defaultStatus,
          dryRun: dry,
          replaceExisting: bulkReplace,
          year: calYear,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Vacation import failed");
      vacResult = json as ImportResponse;
    }

    let floatResult: FloatImportResponse | null = null;
    if (entry.floatDays.length > 0) {
      const res = await fetch("/api/admin/float-bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicianEmail: entry.physicianEmail.trim(),
          dates: entry.floatDays,
          year: calYear,
          dryRun: dry,
          replaceExisting: bulkReplace,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Float import failed");
      floatResult = json as FloatImportResponse;
    }

    return { vacResult, floatResult };
  }

  async function handleBulkImport() {
    if (!sheets) return;
    const active = sheets.filter((s) => !s.skip && s.physicianEmail.trim());
    if (active.length === 0) {
      toast.error("Fill in physician emails for at least one sheet");
      return;
    }
    setBulkImporting(true);
    let successCount = 0;
    for (let i = 0; i < sheets.length; i++) {
      const entry = sheets[i];
      if (entry.skip || !entry.physicianEmail.trim()) continue;
      setSheets((prev) =>
        prev!.map((s, j) => (j === i ? { ...s, importing: true } : s))
      );
      try {
        const { vacResult, floatResult } = await importSheet(i, bulkDryRun);
        setSheets((prev) =>
          prev!.map((s, j) =>
            j === i
              ? { ...s, result: vacResult ?? undefined, floatResult: floatResult ?? undefined, importing: false }
              : s
          )
        );
        successCount++;
      } catch (err) {
        toast.error(`${entry.sheetName}: ${err instanceof Error ? err.message : "failed"}`);
        setSheets((prev) =>
          prev!.map((s, j) => (j === i ? { ...s, importing: false } : s))
        );
      }
    }
    setBulkImporting(false);
    if (successCount > 0) {
      toast.success(
        bulkDryRun
          ? `Dry run complete for ${successCount} physician${successCount !== 1 ? "s" : ""}`
          : `Imported for ${successCount} physician${successCount !== 1 ? "s" : ""}`
      );
    }
  }

  // ── Manual file upload (legacy) ─────────────────────────────────────────────

  async function handleManualFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
      if (rows.length === 0) { toast.error("No data found"); return; }

      let lines: string[];
      if (isCalendarGridFormat(rows)) {
        lines = extractCalendarGridRanges(rows);
      } else {
        let startIdx = 0, endIdx = 1, reasonIdx = 2, dataStartRow = 0;
        const normalize = (v: unknown) => String(v ?? "").toLowerCase().trim();
        const firstRow = rows[0] as unknown[];
        const hasHeader = firstRow.some((v) => {
          const s = normalize(v);
          return s.includes("start") || s.includes("end") || s === "from" || s === "to";
        });
        if (hasHeader) {
          dataStartRow = 1;
          firstRow.forEach((h, i) => {
            const s = normalize(h);
            if (s.includes("start") || s === "from") startIdx = i;
            else if (s.includes("end") || s === "to") endIdx = i;
            else if (s.includes("reason") || s.includes("note")) reasonIdx = i;
          });
        }
        lines = [];
        for (let i = dataStartRow; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;
          const startDate = toISODateStr(row[startIdx]);
          const endDate = toISODateStr(row[endIdx] ?? row[startIdx]);
          const reason = row[reasonIdx] ? String(row[reasonIdx]).trim() : "";
          if (startDate && endDate) {
            lines.push(reason ? `${startDate},${endDate},${reason}` : `${startDate},${endDate}`);
          }
        }
      }
      if (lines.length === 0) { toast.error("No valid date rows found"); return; }
      setRangesText(lines.join("\n"));
      toast.success(`Loaded ${lines.length} range${lines.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setFileLoading(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleManualSubmit() {
    setResponse(null);
    setParseErrors([]);
    const { ok, errors } = parseRanges(rangesText);
    if (errors.length > 0) { setParseErrors(errors); return; }
    if (ok.length === 0) { toast.error("No valid ranges"); return; }
    if (!physicianEmail.trim()) { toast.error("Physician email required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/vacation-bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ physicianEmail: physicianEmail.trim(), ranges: ok, defaultStatus, dryRun }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Import failed"); return; }
      setResponse(json as ImportResponse);
      toast.success(
        dryRun
          ? `Would create ${json.counts.created}, skip ${json.counts.skipped}`
          : `Created ${json.counts.created}, skipped ${json.counts.skipped}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl space-y-8">

      {/* ── Section 1: Annual color-calendar bulk import ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Annual calendar import</h2>
          <p className="text-muted-foreground text-sm">
            Upload your yearly Excel calendar (one tab per physician). Vacation days are detected
            from <strong>V</strong> / <strong>0.5V</strong> codes and float days from <strong>F</strong> codes
            in the row below each date. All physicians are imported in one shot.
          </p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Button
            variant="outline"
            disabled={fileLoading}
            onClick={() => bulkFileRef.current?.click()}
          >
            {fileLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload calendar (.xlsx)
          </Button>
          <input
            ref={bulkFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleColorCalendarUpload}
          />
        </div>

        {sheets && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                Detected <strong>{sheets.length}</strong> physician sheets for{" "}
                <strong>{calYear}</strong>.{" "}
                Emails auto-matched from physician names — verify before importing.
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bulkDryRun"
                    checked={bulkDryRun}
                    onCheckedChange={(v) => setBulkDryRun(v === true)}
                  />
                  <Label htmlFor="bulkDryRun" className="cursor-pointer text-sm">
                    Dry run
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bulkReplace"
                    checked={bulkReplace}
                    onCheckedChange={(v) => setBulkReplace(v === true)}
                  />
                  <Label htmlFor="bulkReplace" className="cursor-pointer text-sm" title={`Delete each physician's existing ${calYear} vacations and imported float days before importing`}>
                    Replace existing
                  </Label>
                </div>
                <Select
                  value={defaultStatus}
                  onValueChange={(v) => setDefaultStatus(v as "APPROVED" | "PENDING")}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="PENDING">PENDING</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleBulkImport}
                  disabled={bulkImporting}
                >
                  {bulkImporting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  {bulkDryRun ? "Dry Run All" : "Import All"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {sheets.map((entry, i) => (
                <Card
                  key={entry.sheetName}
                  className={[
                    entry.skip ? "opacity-50" : "",
                    !entry.skip && entry.warnings.length > 0 ? "border-amber-400 border-2" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Skip toggle */}
                      <Checkbox
                        checked={!entry.skip}
                        onCheckedChange={(v) =>
                          setSheets((prev) =>
                            prev!.map((s, j) =>
                              j === i ? { ...s, skip: v !== true } : s
                            )
                          )
                        }
                      />
                      {/* Sheet name */}
                      <div className="w-28 text-sm font-medium truncate" title={entry.sheetName}>
                        {entry.sheetName}
                      </div>
                      {/* Vacation day count badge */}
                      {entry.ranges.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {entry.ranges.reduce(
                            (n, r) => {
                              const s = new Date(r.startDate + "T12:00:00");
                              const e = new Date(r.endDate + "T12:00:00");
                              return n + Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
                            },
                            0
                          )}{" "}
                          vac
                        </Badge>
                      )}
                      {/* Float day count badge */}
                      {entry.floatDays.length > 0 && (
                        <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
                          {entry.floatDays.length} float
                        </Badge>
                      )}
                      {/* Parser warning badge */}
                      {!entry.skip && entry.warnings.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSheets((prev) =>
                              prev!.map((s, j) =>
                                j === i ? { ...s, showDiagnostics: !s.showDiagnostics } : s,
                              ),
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          title="Click for parser diagnostics"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {entry.warnings.length} warning{entry.warnings.length === 1 ? "" : "s"}
                        </button>
                      )}
                      {/* Email input with match indicator */}
                      <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                        <Input
                          className={`h-8 text-sm flex-1 ${!entry.skip && !entry.physicianEmail ? "border-amber-400" : ""}`}
                          type="email"
                          placeholder="physician@example.com"
                          value={entry.physicianEmail}
                          onChange={(e) =>
                            setSheets((prev) =>
                              prev!.map((s, j) =>
                                j === i ? { ...s, physicianEmail: e.target.value, emailMatched: false } : s
                              )
                            )
                          }
                          disabled={entry.skip}
                        />
                        {!entry.skip && (
                          entry.emailMatched ? (
                            <span title="Auto-matched" className="text-green-600 text-base leading-none">✓</span>
                          ) : entry.physicianEmail ? (
                            <span title="Manually entered" className="text-muted-foreground text-base leading-none">✎</span>
                          ) : (
                            <span title="No match found — enter email manually" className="text-amber-500 text-base leading-none">!</span>
                          )
                        )}
                      </div>
                      {/* Per-row status */}
                      {entry.importing && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {(entry.result || entry.floatResult) && !entry.importing && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap space-x-2">
                          {entry.result && (
                            <span>
                              vac: {entry.result.dryRun ? "would create" : "created"}{" "}
                              <strong>{entry.result.counts.created}</strong>
                              {!entry.result.dryRun && (entry.result.replaced ?? 0) > 0 && (
                                <span className="ml-1">(replaced {entry.result.replaced})</span>
                              )}
                              {entry.result.counts.errors > 0 && (
                                <span className="text-destructive ml-1">({entry.result.counts.errors} err)</span>
                              )}
                            </span>
                          )}
                          {entry.floatResult && (
                            <span>
                              float: {entry.floatResult.dryRun ? "would create" : "created"}{" "}
                              <strong>{entry.floatResult.counts.created}</strong>
                              {entry.floatResult.counts.errors > 0 && (
                                <span className="text-destructive ml-1">({entry.floatResult.counts.errors} err)</span>
                              )}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Ambiguous email candidates picker */}
                    {!entry.skip && entry.emailAmbiguous && entry.emailCandidates && entry.emailCandidates.length > 0 && (
                      <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        Multiple physicians matched <strong>{entry.sheetName}</strong>:{" "}
                        {entry.emailCandidates.map((email, k) => (
                          <button
                            key={email}
                            type="button"
                            onClick={() =>
                              setSheets((prev) =>
                                prev!.map((s, j) =>
                                  j === i
                                    ? {
                                        ...s,
                                        physicianEmail: email,
                                        emailMatched: true,
                                        emailAmbiguous: false,
                                      }
                                    : s,
                                ),
                              )
                            }
                            className="underline text-amber-900 hover:text-amber-700 mx-1"
                          >
                            {email}{k < entry.emailCandidates!.length - 1 ? "," : ""}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Parser diagnostics panel */}
                    {!entry.skip && entry.warnings.length > 0 && entry.showDiagnostics && (
                      <div className="mt-2 text-xs bg-amber-50 border border-amber-300 rounded p-2 space-y-2">
                        <div className="font-semibold text-amber-900">Parser warnings</div>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-900">
                          {entry.warnings.map((w, k) => (
                            <li key={k}>{w.message}</li>
                          ))}
                        </ul>
                        {entry.diagnostics.length > 0 && (
                          <div>
                            <div className="font-semibold text-amber-900 mt-1.5">Per-month diagnostics</div>
                            <div className="overflow-x-auto">
                              <table className="text-xs font-mono">
                                <thead>
                                  <tr className="text-amber-900">
                                    <th className="text-left pr-3">mo</th>
                                    <th className="text-left pr-3">dowRow</th>
                                    <th className="text-left pr-3">codeStride</th>
                                    <th className="text-left pr-3">dates</th>
                                    <th className="text-left pr-3">vac</th>
                                    <th className="text-left pr-3">half</th>
                                    <th className="text-left pr-3">float</th>
                                    <th className="text-left">redOnly</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.diagnostics.map((d) => (
                                    <tr key={d.month}>
                                      <td className="pr-3">{d.month}</td>
                                      <td className="pr-3">{d.dowRow === null ? "—" : d.dowRow + 1}</td>
                                      <td className="pr-3">{d.codeRowStride}</td>
                                      <td className="pr-3">{d.dateCount}</td>
                                      <td className="pr-3">{d.vacationCount}</td>
                                      <td className="pr-3">{d.halfCount}</td>
                                      <td className="pr-3">{d.floatCount}</td>
                                      <td>{d.redOnlyCount}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expanded result table for this sheet */}
                    {entry.result && entry.result.results.length > 0 && (
                      <div className="mt-2 max-h-40 overflow-y-auto text-xs rounded border">
                        <table className="w-full">
                          <tbody>
                            {entry.result.results.map((row, k) => (
                              <tr key={k} className="border-t">
                                <td className="px-2 py-0.5 font-mono text-muted-foreground">
                                  {row.startDate === row.endDate
                                    ? row.startDate
                                    : `${row.startDate} → ${row.endDate}`}
                                </td>
                                <td className="px-2 py-0.5">
                                  {row.status === "created" || row.status === "would-create" ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-600 inline" />
                                  ) : row.status === "skipped" ? (
                                    <SkipForward className="h-3 w-3 text-muted-foreground inline" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-destructive inline" />
                                  )}
                                  {"reason" in row && (
                                    <span className="ml-1 text-muted-foreground">{row.reason}</span>
                                  )}
                                  {"error" in row && (
                                    <span className="ml-1 text-destructive">{row.error}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <hr />

      {/* ── Section 2: Image (photo) import ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Import from photo</h2>
          <p className="text-muted-foreground text-sm">
            Upload a photo of a physician&apos;s yearly calendar. Claude will identify
            the red-highlighted vacation days automatically.
          </p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Button
            variant="outline"
            disabled={imageLoading}
            onClick={() => imageRef.current?.click()}
          >
            {imageLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ImageIcon className="h-4 w-4 mr-2" />
            )}
            Upload calendar photo
          </Button>
          <input
            ref={imageRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleImageUpload}
          />
          <span className="text-xs text-muted-foreground">JPEG, PNG, WebP</span>
        </div>

        {imageRanges && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Found{" "}
              <strong>
                {imageRanges.reduce((n, r) => {
                  const s = new Date(r.startDate + "T12:00:00");
                  const e2 = new Date(r.endDate + "T12:00:00");
                  return n + Math.round((e2.getTime() - s.getTime()) / 86400000) + 1;
                }, 0)}
              </strong>{" "}
              vacation days across <strong>{imageRanges.length}</strong> range
              {imageRanges.length !== 1 ? "s" : ""} for{" "}
              <strong>{imageYear}</strong>.
            </div>

            <div className="max-h-40 overflow-y-auto rounded-md border text-xs font-mono">
              <table className="w-full">
                <tbody>
                  {imageRanges.map((r, i) => (
                    <tr key={i} className="border-t first:border-t-0">
                      <td className="px-3 py-1 text-muted-foreground">
                        {r.startDate === r.endDate
                          ? r.startDate
                          : `${r.startDate} → ${r.endDate}`}
                      </td>
                      {r.halfDay && r.halfDay !== "NONE" && (
                        <td className="px-3 py-1 text-muted-foreground">{r.halfDay.toLowerCase()}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="email"
                placeholder="physician@example.com"
                className="w-72 h-8 text-sm"
                value={imageEmail}
                onChange={(e) => setImageEmail(e.target.value)}
              />
              <Select
                value={defaultStatus}
                onValueChange={(v) => setDefaultStatus(v as "APPROVED" | "PENDING")}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED">APPROVED</SelectItem>
                  <SelectItem value="PENDING">PENDING</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={imageImporting}
                onClick={() => handleImageImport(true)}
              >
                {imageImporting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Dry Run
              </Button>
              <Button
                size="sm"
                disabled={imageImporting}
                onClick={() => handleImageImport(false)}
              >
                {imageImporting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Import
              </Button>
            </div>

            {imageResult && (
              <div className="text-sm">
                <span className="font-semibold">{imageResult.dryRun ? "Dry run" : "Result"}:</span>{" "}
                {imageResult.counts.created} {imageResult.dryRun ? "would create" : "created"},{" "}
                {imageResult.counts.skipped} skipped
                {imageResult.counts.errors > 0 && (
                  <span className="text-destructive ml-1">
                    , {imageResult.counts.errors} errors
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <hr />

      {/* ── Section 3: Manual single-physician import ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Manual import</h2>
          <p className="text-muted-foreground text-sm">
            Import vacation ranges for one physician by entering dates manually or uploading a simple start/end CSV.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Physician email</Label>
          <Input
            type="email"
            placeholder="someone@example.com"
            value={physicianEmail}
            onChange={(e) => setPhysicianEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Ranges</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fileLoading}
              onClick={() => fileRef.current?.click()}
            >
              {fileLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload CSV/XLSX
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleManualFileUpload}
            />
          </div>
          <textarea
            className="border-input bg-background h-48 w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={PLACEHOLDER}
            value={rangesText}
            onChange={(e) => setRangesText(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Checkbox
              id="dryRun"
              checked={dryRun}
              onCheckedChange={(v) => setDryRun(v === true)}
            />
            <Label htmlFor="dryRun" className="cursor-pointer">
              Dry run
            </Label>
          </div>
          <Select
            value={defaultStatus}
            onValueChange={(v) => setDefaultStatus(v as "APPROVED" | "PENDING")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="APPROVED">APPROVED</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleManualSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {dryRun ? "Preview" : "Import"}
          </Button>
        </div>

        {parseErrors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <div className="mb-1 font-semibold text-destructive">Parse errors</div>
            <ul className="list-inside list-disc">
              {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {response && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-semibold">{response.dryRun ? "Dry run" : "Result"}:</span>{" "}
              {response.counts.created} {response.dryRun ? "would create" : "created"},{" "}
              {response.counts.skipped} skipped, {response.counts.errors} errors
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Start</th>
                    <th className="px-3 py-2 text-left">End</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {response.results.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1 font-mono">{row.startDate}</td>
                      <td className="px-3 py-1 font-mono">{row.endDate}</td>
                      <td className="px-3 py-1">{row.status}</td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {"reason" in row ? row.reason : "error" in row ? row.error : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
