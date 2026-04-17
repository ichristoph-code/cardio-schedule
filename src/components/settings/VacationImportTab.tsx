"use client";

import { useState } from "react";
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
        <Label htmlFor="ranges">Ranges</Label>
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
