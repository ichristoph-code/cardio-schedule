"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_CALENDAR_YEAR } from "@/lib/calendar-years";
import { ScheduleChangeSummary } from "./ScheduleChangeSummary";
import type { SchedulePreview } from "@/lib/scheduling/plan";

type Recovery = { id: string; label: string; createdAt: string; assignmentCount: number };
interface Props {
  roleTypes?: { id: string; displayName: string; category: string }[];
  existingSchedules?: { year: number; status: string }[];
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const selectClass = "h-10 w-full rounded-lg border bg-background px-3 text-sm disabled:opacity-50";

export function ScheduleGenerateButton({ roleTypes = [], existingSchedules = [] }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(DEFAULT_CALENDAR_YEAR);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [applied, setApplied] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [restoreMode, setRestoreMode] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const years = [...new Set([DEFAULT_CALENDAR_YEAR, ...existingSchedules.map((s) => s.year), ...Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 1)])].sort();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/schedules?recoveryYear=${year}`, { signal: controller.signal })
      .then(async (res) => { if (!res.ok) throw new Error("Could not load recovery point"); return res.json(); })
      .then((data) => { setRecovery(data.recovery); setRecoveryError(""); })
      .catch((error) => { if (!controller.signal.aborted) setRecoveryError(error.message); });
    return () => controller.abort();
  }, [open, year]);

  function changeSelection(update: () => void) {
    update(); setPreview(null); setApplied(false); setRestoreMode(false); setPassword("");
  }
  async function request(body: Record<string, unknown>) {
    const res = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) { setPreview(null); setRecovery(null); setRestoreMode(false); }
      throw new Error(data.error || "Operation failed");
    }
    return data;
  }
  async function buildPreview(resetOnly: boolean) {
    setBusy(true);
    try {
      const data = await request({ action: "preview", year, startMonth, endMonth, roleTypeIds: selected, resetOnly });
      setPreview(data); setApplied(false); setRestoreMode(false); setPassword("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Preview failed"); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await request({ action: "apply", previewId: preview.previewId, password });
      setApplied(true); setPassword("");
      setRecovery({ id: result.recoveryId, label: preview.scope.resetOnly ? "Reset roles" : "Generate schedule", createdAt: new Date().toISOString(), assignmentCount: preview.summary.replacedCount + preview.summary.retainedCount });
      toast.success("Schedule saved. Review the results below."); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!recovery) return;
    setBusy(true);
    try {
      await request({ action: "restore", recoveryId: recovery.id, password });
      setRecovery(null); setRestoreMode(false); setPreview(null); setApplied(false); setPassword("");
      toast.success("Previous schedule restored"); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Restore failed"); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setPassword(""); setRestoreMode(false); if (!value) { setPreview(null); setApplied(false); } } }}>
    <DialogTrigger className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium cursor-pointer"><Calendar className="mr-2 h-4 w-4" />Generate Schedule</DialogTrigger>
    <DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{restoreMode ? "Restore previous schedule" : applied ? "Schedule saved" : "Preview schedule changes"}</DialogTitle>
        <DialogDescription>Review the affected dates, coverage, and workload before saving. Each change includes a recovery point.</DialogDescription></DialogHeader>
      <fieldset disabled={busy || restoreMode || applied} className="space-y-4 disabled:opacity-60">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label htmlFor="schedule-year">Year</Label><select id="schedule-year" className={selectClass} value={year} onChange={(e) => changeSelection(() => { setYear(Number(e.target.value)); setRecovery(null); })}>{years.map((y) => <option key={y}>{y}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="schedule-start">From</Label><select id="schedule-start" className={selectClass} value={startMonth} onChange={(e) => changeSelection(() => setStartMonth(Number(e.target.value)))}>{MONTHS.map((m, i) => <option key={m} value={i + 1} disabled={i + 1 > endMonth}>{m}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="schedule-end">Through</Label><select id="schedule-end" className={selectClass} value={endMonth} onChange={(e) => changeSelection(() => setEndMonth(Number(e.target.value)))}>{MONTHS.map((m, i) => <option key={m} value={i + 1} disabled={i + 1 < startMonth}>{m}</option>)}</select></div>
        </div>
        <div className="flex justify-between items-center"><span className="text-sm font-medium">Roles</span><Button variant="ghost" size="sm" onClick={() => changeSelection(() => setSelected(selected.length === roleTypes.length ? [] : roleTypes.map((r) => r.id)))}>{selected.length === roleTypes.length ? "Deselect all" : "Select all"}</Button></div>
        <div className="grid sm:grid-cols-2 gap-2">{roleTypes.map((r) => <label key={r.id} className="flex gap-3 items-center rounded-lg border p-3 text-sm"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => changeSelection(() => setSelected(selected.includes(r.id) ? selected.filter((id) => id !== r.id) : [...selected, r.id]))} className="size-4 accent-blue-700" />{r.displayName}</label>)}</div>
        <div className="flex flex-wrap gap-2"><Button disabled={!selected.length} onClick={() => buildPreview(false)}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Preview generation</Button><Button variant="outline" disabled={!selected.length || !existingSchedules.some((s) => s.year === year)} onClick={() => buildPreview(true)}>Preview reset</Button></div>
      </fieldset>
      {preview && <section className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">{preview.scope.resetOnly ? "Reset" : "Generate"} · {MONTHS[preview.scope.startMonth - 1]}–{MONTHS[preview.scope.endMonth - 1]} {preview.scope.year}</h3>
        <p className="text-sm text-muted-foreground">Other months and unchecked roles stay unchanged.{!preview.scope.resetOnly && " Manually entered Hospital Float days are kept."}</p>
        <ScheduleChangeSummary summary={preview.summary} />
        {!applied && !restoreMode && <><Label htmlFor="schedule-password">Re-enter your password to apply this preview</Label><Input id="schedule-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /><Button variant={preview.scope.resetOnly ? "destructive" : "default"} disabled={busy || !password} onClick={apply}>{busy ? "Saving…" : preview.scope.resetOnly ? "Apply reset" : "Apply schedule"}</Button></>}
      </section>}
      {recoveryError && <p role="alert" className="text-sm text-destructive">{recoveryError}</p>}
      {recovery && <section className="space-y-3 border-t pt-4">
        <p className="text-sm">Recovery available: before {recovery.label.toLowerCase()} on {new Date(recovery.createdAt).toLocaleString()}.</p>
        {restoreMode ? <><p className="text-sm">Restore the previous {year} schedule ({recovery.assignmentCount} assignments). Restoration is blocked if someone has made newer changes.</p><Label htmlFor="restore-password">Confirm with your password</Label><Input id="restore-password" type="password" autoComplete="current-password" disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /><div className="flex gap-2"><Button disabled={busy || !password} onClick={restore}>Restore previous schedule</Button><Button variant="outline" disabled={busy} onClick={() => { setRestoreMode(false); setPassword(""); }}>Cancel</Button></div></>
          : <Button variant="outline" disabled={busy} onClick={() => { setRestoreMode(true); setPassword(""); }}><RotateCcw className="mr-2 size-4" />Review recovery</Button>}
      </section>}
    </DialogContent>
  </Dialog>;
}
