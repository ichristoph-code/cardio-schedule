export function YearSummary({ workdays, vacation, holidays, float }: { workdays: number; vacation: number; holidays: number; float: number }) {
  return <dl aria-label="Year totals" className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {[["Workdays", workdays], ["Vacation", vacation], ["Holidays", holidays], ["Hospital Float", float]].map(([label, value]) =>
      <div key={label} className="rounded-xl border bg-white/90 dark:bg-card px-4 py-3 shadow-sm">
        <dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
        {label === "Hospital Float" && <p className="text-xs text-muted-foreground">Included in workdays</p>}
      </div>)}
  </dl>;
}
