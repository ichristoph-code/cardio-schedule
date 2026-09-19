import { SWATCH } from "@/components/calendar/year-grid";

/** One entry in a calendar's legend row: an optional colour swatch and a label. */
export function LegendItem({ swatch, children }: { swatch?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {swatch && <span className={`${SWATCH} ${swatch}`} />}
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}
