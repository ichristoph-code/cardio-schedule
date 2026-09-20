import type { SchedulePreview } from "@/lib/scheduling/plan";

export function ScheduleChangeSummary({ summary }: { summary: SchedulePreview["summary"] }) {
  return <div className="space-y-4" aria-live="polite">
    <div className="grid grid-cols-3 gap-2 text-center">
      {[["Replaced / removed", summary.replacedCount], ["New assignments", summary.addedCount], ["Kept", summary.retainedCount]].map(([label, count]) =>
        <div key={label} className="rounded-lg border bg-muted/30 p-3"><div className="text-xl font-semibold tabular-nums">{count}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}
    </div>
    {summary.manualCount > 0 && <p className="rounded-lg border border-amber-500 p-3 text-sm">This includes {summary.manualCount} manually assigned duties. A recovery point will be saved before applying.</p>}
    <details open={summary.unfilledSlots.length > 0} className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Unfilled duties in generated range: {summary.unfilledSlots.length}</summary>
      <ul className="mt-2 max-h-48 overflow-y-auto text-sm space-y-1">{summary.unfilledSlots.map((s, i) => <li key={i}>{s.date} · {s.roleName}</li>)}</ul>
    </details>
    <details open={summary.conflicts.length > 0} className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Availability and eligibility warnings: {summary.conflicts.length}</summary>
      <p className="mt-1 text-xs text-muted-foreground">Checks vacation, recurring days off, no-call days, and role eligibility, including retained assignments.</p>
      <ul className="mt-2 max-h-48 overflow-y-auto text-sm space-y-2">{summary.conflicts.map((s, i) => <li key={i}>{s.date} · {s.physician} · {s.role}<br /><span className="text-muted-foreground">{s.reason}</span></li>)}</ul>
    </details>
    <details className="rounded-lg border p-3" open>
      <summary className="cursor-pointer text-sm font-medium">Workload after this change · full year</summary>
      <div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Physician</th><th className="p-2">Duties</th><th className="p-2">By role</th></tr></thead>
        <tbody>{summary.distribution.map((p, i) => <tr key={i} className="border-t"><td className="p-2">{p.physician}</td><td className="p-2 tabular-nums">{p.total}</td><td className="p-2 text-xs text-muted-foreground">{p.roles.map((r) => `${r.role}: ${r.count}`).join(" · ") || "None"}</td></tr>)}</tbody>
      </table></div>
    </details>
  </div>;
}
