"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DAY_TYPE_OPTIONS, type DayState, type DayTypeOption } from "@/components/vacation/day-types";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2027-03-04" -> "Mar 4", without constructing a Date (no timezone hazard). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${MONTH_ABBR[Number(month) - 1]} ${Number(day)}`;
}

/**
 * Describes the selection in the bar: a single day, a clean span, or a count
 * with its outer bounds when the days aren't contiguous.
 */
function describeSelection(dates: string[]): string {
  if (dates.length === 1) return shortDate(dates[0]);
  const span = `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`;
  return `${dates.length} days · ${span}`;
}

interface Props {
  physicianId: string;
  physicianName: string;
  year: number;
  /** Selected dates, ascending. */
  dates: string[];
  onClear: () => void;
  /** Called after a successful apply so the parent can drop the selection. */
  onApplied: () => void;
}

export function DaySelectionBar({
  physicianId,
  physicianName,
  year,
  dates,
  onClear,
  onApplied,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<DayState | null>(null);

  async function apply(opt: DayTypeOption) {
    if (saving) return;
    setSaving(opt.state);
    try {
      const res = await fetch("/api/admin/calendar-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicianId,
          dates,
          year,
          type: opt.type,
          ...(opt.halfPeriod ? { halfPeriod: opt.halfPeriod } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update days");
      }
      const noun = dates.length === 1 ? "day" : "days";
      toast.success(
        opt.state === "NONE"
          ? `Cleared ${dates.length} ${noun}`
          : `${opt.label} set on ${dates.length} ${noun}`,
      );
      router.refresh();
      onApplied();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update days");
    } finally {
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <div
      role="region"
      aria-label="Bulk day editor"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mr-1 flex flex-col leading-tight">
          <span className="text-sm font-semibold" aria-live="polite">
            {describeSelection(dates)}
          </span>
          <span className="text-[11px] text-muted-foreground">{physicianName}</span>
        </div>

        {DAY_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <Button
              key={opt.state}
              size="sm"
              variant="outline"
              className={`h-9 gap-1.5 px-2.5 ${opt.state === "NONE" ? "" : opt.active}`}
              disabled={busy}
              onClick={() => apply(opt)}
              title={`${opt.label} — ${dates.length} selected`}
            >
              {saving === opt.state ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{opt.shortLabel}</span>
            </Button>
          );
        })}

        <Button
          size="sm"
          variant="ghost"
          className="h-9 gap-1.5 px-2.5 text-muted-foreground"
          disabled={busy}
          onClick={onClear}
          title="Clear selection (Esc)"
        >
          <X className="h-3.5 w-3.5" />
          <span className="text-xs">Deselect</span>
        </Button>
      </div>
    </div>
  );
}
