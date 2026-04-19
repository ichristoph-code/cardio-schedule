"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

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

// Calendar grid format support (same format as UploadVacationDialog)
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

function extractCalendarGridRanges(rows: unknown[][]): string[] {
  const vacDays: string[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i] as unknown[];
    const nextRow = rows[i + 1] as unknown[];
    const hasDate = GRID_MONTH_COLS.some((cols) => cols.some((c) => row[c] instanceof Date));
    if (!hasDate) continue;
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
  // Group with weekend bridging (≤ 3 day gaps)
  const ranges: [string, string][] = [];
  for (const d of vacDays) {
    if (ranges.length === 0) { ranges.push([d, d]); continue; }
    const last = ranges[ranges.length - 1];
    if (gapIsWeekendOnly(last[1], d)) { last[1] = d; } else { ranges.push([d, d]); }
  }
  return ranges.map(([s, e]) => (s === e ? s : `${s},${e}`));
}

function gapIsWeekendOnly(startStr: string, endStr: string): boolean {
  const d = new Date(startStr + "T12:00:00");
  const end = new Date(endStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  while (d < end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) return false;
    d.setDate(d.getDate() + 1);
  }
  return true;
}

type RowResult =
  | { startDate: string; endDate: string; status: "created" | "would-create" }
  | { startDate: string; endDate: string; status: "skipped"; reason: string }
  | { startDate: string; endDate: string; status: "error"; error: string };

interface ImportResponse {
  physicianEmail: string;
  physicianId: string;
  dryRun: boolean;
  defaultStatus: "APPROVED" | "PENDING";
  counts: { created: number; skipped: number; errors: number; total: number };
  results: RowResult[];
}

const PLACEHOLDER = `# One range per line, formats accepted:
#   YYYY-MM-DD                    (single day)
#   YYYY-MM-DD,YYYY-MM-DD         (range)
#   YYYY-MM-DD,YYYY-MM-DD,reason  (range with reason)
2026-07-13,2026-07-17,Sisters in Oregon
2026-08-05,2026-08-07
2026-09-04`;

function parseRanges(
  raw: string,
): { ok: Array<{ startDate: string; endDate: string; reason?: string }>; errors: string[] } {
  const ok: Array<{ startDate: string; endDate: string; reason?: string }> = [];
  const errors: string[] = [];
  const lines = raw.split("\n");
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(",").map((p) => p.trim());
    const start = parts[0];
    const end = parts[1] || parts[0];
    const reason = parts.slice(2).join(",").trim() || undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      errors.push(`Line ${i + 1}: invalid date format \`${line}\``);
      return;
    }
    ok.push({ startDate: start, endDate: end, reason });
  });
  return { ok, errors };
}

export function VacationImportTab() {
  const [physicianEmail, setPhysicianEmail] = useState("");
  const [defaultStatus, setDefaultStatus] = useState<"APPROVED" | "PENDING">(
    "APPROVED",
  );
  const [dryRun, setDryRun] = useState(true);
  const [rangesText, setRangesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

      if (rows.length === 0) { toast.error("No data found in file"); return; }

      let lines: string[];

      if (isCalendarGridFormat(rows)) {
        // Calendar grid format (V = vacation day, dates in alternating rows)
        lines = extractCalendarGridRanges(rows);
      } else {
        // Simple start/end column format
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
            if (s.includes("start") || s === "from" || s === "begin") startIdx = i;
            else if (s.includes("end") || s === "to" || s === "through") endIdx = i;
            else if (s.includes("reason") || s.includes("note") || s.includes("comment")) reasonIdx = i;
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

      if (lines.length === 0) { toast.error("No valid date rows found in file"); return; }
      setRangesText(lines.join("\n"));
      toast.success(`Loaded ${lines.length} range${lines.length !== 1 ? "s" : ""} from ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setFileLoading(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleSubmit() {
    setResponse(null);
    setParseErrors([]);

    const { ok, errors } = parseRanges(rangesText);
    if (errors.length > 0) {
      setParseErrors(errors);
      return;
    }
    if (ok.length === 0) {
      toast.error("No valid ranges to import");
      return;
    }
    if (!physicianEmail.trim()) {
      toast.error("Physician email is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/vacation-bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicianEmail: physicianEmail.trim(),
          ranges: ok,
          defaultStatus,
          dryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Import failed");
        return;
      }
      setResponse(json as ImportResponse);
      const verb = dryRun ? "would create" : "created";
      toast.success(
        `${verb} ${json.counts.created}, skipped ${json.counts.skipped}, errors ${json.counts.errors}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Bulk import vacation</h2>
        <p className="text-muted-foreground text-sm">
          Insert vacation requests for any physician by email. Exact duplicate
          ranges (same physician + start + end) are skipped. Use Dry Run first
          to preview.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="physicianEmail">Physician email</Label>
        <Input
          id="physicianEmail"
          type="email"
          placeholder="someone@example.com"
          value={physicianEmail}
          onChange={(e) => setPhysicianEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="defaultStatus">Default status</Label>
        <Select
          value={defaultStatus}
          onValueChange={(v) => setDefaultStatus(v as "APPROVED" | "PENDING")}
        >
          <SelectTrigger id="defaultStatus" className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="APPROVED">APPROVED</SelectItem>
            <SelectItem value="PENDING">PENDING</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="ranges">Ranges</Label>
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
            Upload file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
        <textarea
          id="ranges"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-72 w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          placeholder={PLACEHOLDER}
          value={rangesText}
          onChange={(e) => setRangesText(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="dryRun"
          checked={dryRun}
          onCheckedChange={(v) => setDryRun(v === true)}
        />
        <Label htmlFor="dryRun" className="cursor-pointer">
          Dry run (preview only, no writes)
        </Label>
      </div>

      <div>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : dryRun ? "Preview" : "Import"}
        </Button>
      </div>

      {parseErrors.length > 0 && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
          <div className="mb-1 font-semibold text-red-600">Parse errors</div>
          <ul className="list-inside list-disc">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {response && (
        <div className="space-y-3">
          <div className="text-sm">
            <span className="font-semibold">
              {response.dryRun ? "Dry run" : "Result"}:
            </span>{" "}
            {response.counts.created}{" "}
            {response.dryRun ? "would create" : "created"},{" "}
            {response.counts.skipped} skipped, {response.counts.errors} errors
            (of {response.counts.total} rows)
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border">
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
                      {"reason" in row
                        ? row.reason
                        : "error" in row
                          ? row.error
                          : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
