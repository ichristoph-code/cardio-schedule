"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ParsedRow {
  startDate: string;
  endDate: string;
  reason?: string;
  error?: string;
}

interface ImportResult {
  counts: { created: number; skipped: number; errors: number; total: number };
  results: Array<{
    startDate: string;
    endDate: string;
    status: "created" | "skipped" | "error";
    reason?: string;
    error?: string;
  }>;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

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

// Calendar grid format: alternating date rows / code rows, "V" = vacation day.
// Detected when the legend column (col 1) contains short codes like "V", "W", "H".
const GRID_LEGEND_CODES = new Set(["V", "W", "H", "F", "_", "Call", "0.5V", "1.5W"]);
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

function isDateRow(row: unknown[]): boolean {
  for (const cols of GRID_MONTH_COLS) {
    for (const c of cols) {
      if (row[c] instanceof Date) return true;
    }
  }
  return false;
}

// Returns true only if every day strictly between startStr and endStr is Sat or Sun
function gapIsWeekendOnly(startStr: string, endStr: string): boolean {
  const d = new Date(startStr + "T12:00:00");
  const end = new Date(endStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  while (d < end) {
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) return false;
    d.setDate(d.getDate() + 1);
  }
  return true;
}

function parseCalendarGrid(rows: unknown[][]): ParsedRow[] {
  // Collect all individual vacation days
  const vacDays: string[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i] as unknown[];
    const nextRow = rows[i + 1] as unknown[];
    if (!isDateRow(row)) continue;

    for (const cols of GRID_MONTH_COLS) {
      for (const c of cols) {
        const ds = toISODateStr(row[c]);
        const code = typeof nextRow[c] === "string" ? (nextRow[c] as string).trim().toUpperCase() : null;
        if (ds && code === "V") vacDays.push(ds);
      }
    }
  }

  if (vacDays.length === 0) return [];
  vacDays.sort();

  // Group consecutive days into ranges, bridging only pure weekend gaps (Sat+Sun)
  const ranges: [string, string][] = [];
  for (const d of vacDays) {
    if (ranges.length === 0) {
      ranges.push([d, d]);
      continue;
    }
    const last = ranges[ranges.length - 1];
    if (gapIsWeekendOnly(last[1], d)) {
      last[1] = d;
    } else {
      ranges.push([d, d]);
    }
  }

  return ranges.map(([startDate, endDate]) => ({ startDate, endDate }));
}

async function parseExcelFile(file: File): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  if (rows.length === 0) return [];

  // Detect format: calendar grid vs. simple start/end columns
  if (isCalendarGridFormat(rows)) {
    return parseCalendarGrid(rows);
  }

  // Simple start/end column format
  let startIdx = 0, endIdx = 1, reasonIdx = 2;
  let dataStartRow = 0;

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
      if (s.includes("start") || s === "from" || s === "begin") startIdx = i;
      else if (s.includes("end") || s === "to" || s === "through") endIdx = i;
      else if (s.includes("reason") || s.includes("note") || s.includes("comment")) reasonIdx = i;
    });
  }

  const parsed: ParsedRow[] = [];
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;

    const startRaw = row[startIdx];
    const endRaw = row[endIdx] ?? row[startIdx];
    const reasonRaw = row[reasonIdx];

    const startDate = toISODateStr(startRaw);
    const endDate = toISODateStr(endRaw);
    const reason = reasonRaw ? String(reasonRaw).trim() : undefined;

    if (!startDate || !endDate) {
      parsed.push({
        startDate: String(startRaw ?? ""),
        endDate: String(endRaw ?? ""),
        reason,
        error: "Could not parse dates — check format",
      });
    } else if (endDate < startDate) {
      parsed.push({ startDate, endDate, reason, error: "End date is before start date" });
    } else {
      parsed.push({ startDate, endDate, reason });
    }
  }

  return parsed;
}

export function UploadVacationDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        toast.error("No data found in file");
        return;
      }
      setRows(parsed);
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    }
  }

  async function handleSubmit() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/vacation-requests/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ranges: validRows.map(({ startDate, endDate, reason }) => ({
            startDate,
            endDate,
            reason,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Upload failed");
        return;
      }
      setResult(json as ImportResult);
      setStep("result");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("upload");
    setRows([]);
    setResult(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        Upload Schedule
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-2xl">
          {step === "upload" && (
            <>
              <DialogHeader>
                <DialogTitle>Upload Vacation Schedule</DialogTitle>
                <DialogDescription>
                  Upload an Excel (.xlsx, .xls) or CSV file with your vacation dates. Requests will be submitted as pending for admin approval.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <div className="text-sm font-medium mb-1">Click to select a file</div>
                  <div className="text-xs text-muted-foreground">.xlsx, .xls, .csv accepted</div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="rounded-md bg-muted/50 px-4 py-3 text-xs space-y-1 text-muted-foreground">
                  <div className="font-medium text-foreground text-sm mb-2">Expected format</div>
                  <div>Columns: <code className="bg-muted px-1 rounded">Start Date</code> | <code className="bg-muted px-1 rounded">End Date</code> | <code className="bg-muted px-1 rounded">Reason</code> (optional)</div>
                  <div>Date formats: YYYY-MM-DD, MM/DD/YYYY, or native Excel date cells</div>
                  <div>If no header row, columns are assumed to be in order: Start, End, Reason</div>
                  <div>Single-date rows are treated as same-day requests</div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
              </DialogFooter>
            </>
          )}

          {step === "preview" && (
            <>
              <DialogHeader>
                <DialogTitle>Review Parsed Dates</DialogTitle>
                <DialogDescription>
                  {fileName} &mdash; {validRows.length} valid range{validRows.length !== 1 ? "s" : ""}
                  {errorRows.length > 0 && `, ${errorRows.length} with errors (will be skipped)`}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Start</th>
                      <th className="px-3 py-2 text-left font-medium">End</th>
                      <th className="px-3 py-2 text-left font-medium">Reason</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={`border-t ${row.error ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-1.5">
                          {row.startDate && !row.error ? fmtDate(row.startDate) : row.startDate}
                        </td>
                        <td className="px-3 py-1.5">
                          {row.endDate && !row.error ? fmtDate(row.endDate) : row.endDate}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.reason ?? ""}</td>
                        <td className="px-3 py-1.5">
                          {row.error ? (
                            <span className="text-red-600 text-xs">{row.error}</span>
                          ) : (
                            <span className="text-green-600 text-xs">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { reset(); }}
                >
                  Back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || validRows.length === 0}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Submit {validRows.length} Request{validRows.length !== 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "result" && result && (
            <>
              <DialogHeader>
                <DialogTitle>Upload Complete</DialogTitle>
                <DialogDescription>
                  {result.counts.created} submitted, {result.counts.skipped} skipped (duplicates
                  {result.counts.errors > 0 ? `, ${result.counts.errors} errors` : ""})
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Start</th>
                      <th className="px-3 py-2 text-left font-medium">End</th>
                      <th className="px-3 py-2 text-left font-medium">Result</th>
                      <th className="px-3 py-2 text-left font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t ${
                          row.status === "error"
                            ? "bg-red-50"
                            : row.status === "skipped"
                            ? "bg-muted/40"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-1.5">{fmtDate(row.startDate)}</td>
                        <td className="px-3 py-1.5">{fmtDate(row.endDate)}</td>
                        <td className="px-3 py-1.5 capitalize">{row.status}</td>
                        <td className="px-3 py-1.5 text-muted-foreground text-xs">
                          {row.reason ?? row.error ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
