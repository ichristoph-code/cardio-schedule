"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Palmtree, Sun, Moon, Building2, Stethoscope, Phone, PhoneOff, X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

// The day's current type, as derived from the calendar data.
export type DayState =
  | "VACATION"
  | "HALF_AM"
  | "HALF_PM"
  | "FLOAT"
  | "ROUNDER"
  | "CALL"
  | "NO_CALL"
  | "NONE";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Each option maps a button to the /api/admin/calendar-day request it sends.
// To add a new day type later: add an entry here, extend the API route's TYPES
// (clear + apply), and add a color in YearlyVacationCalendar.tsx.
interface Option {
  state: DayState;
  label: string;
  icon: typeof Palmtree;
  type: string;            // calendar-day API "type"
  halfPeriod?: "MORNING" | "AFTERNOON";
  active: string;          // classes when this option is the current state
}

const OPTIONS: Option[] = [
  { state: "VACATION", label: "Full Vacation", icon: Palmtree, type: "vacation", active: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600" },
  { state: "HALF_AM", label: "½ Day — AM", icon: Sun, type: "half_vacation", halfPeriod: "MORNING", active: "bg-emerald-300 text-emerald-950 border-emerald-300 hover:bg-emerald-400" },
  { state: "HALF_PM", label: "½ Day — PM", icon: Moon, type: "half_vacation", halfPeriod: "AFTERNOON", active: "bg-emerald-300 text-emerald-950 border-emerald-300 hover:bg-emerald-400" },
  { state: "FLOAT", label: "Hospital Float", icon: Building2, type: "float", active: "bg-blue-500 text-white border-blue-500 hover:bg-blue-600" },
  { state: "ROUNDER", label: "ICU Rounder", icon: Stethoscope, type: "rounder", active: "bg-purple-500 text-white border-purple-500 hover:bg-purple-600" },
  { state: "CALL", label: "General Call", icon: Phone, type: "call", active: "bg-neutral-900 text-white border-neutral-900 hover:bg-black" },
  { state: "NO_CALL", label: "No-Call Day", icon: PhoneOff, type: "no_call", active: "bg-slate-500 text-white border-slate-500 hover:bg-slate-600" },
  { state: "NONE", label: "Clear", icon: X, type: "clear", active: "bg-muted text-foreground border-border" },
];

interface Props {
  physicianId: string;
  physicianName: string;
  year: number;
  date: string; // YYYY-MM-DD
  current: DayState;
  holidayName?: string;
  callSource?: "AUTO" | "MANUAL"; // when current === "CALL"
  onClose: () => void;
}

export function DayStateEditor({
  physicianId,
  physicianName,
  year,
  date,
  current,
  holidayName,
  callSource,
  onClose,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<DayState | null>(null);

  const d = new Date(date + "T12:00:00");
  const dayLabel = `${DAY_LABELS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  async function apply(opt: Option) {
    if (saving) return;
    setSaving(opt.state);
    try {
      const res = await fetch("/api/admin/calendar-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicianId,
          date,
          year,
          type: opt.type,
          ...(opt.halfPeriod ? { halfPeriod: opt.halfPeriod } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update day");
      }
      toast.success(opt.state === "NONE" ? "Day cleared" : "Day updated");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update day");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{dayLabel}</SheetTitle>
        </SheetHeader>
        <div className="mt-1 text-sm text-muted-foreground">{physicianName}</div>

        {holidayName && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {holidayName}
          </div>
        )}

        {current === "CALL" && callSource && (
          <div className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            On General Call — {callSource === "MANUAL" ? "manually set" : "assigned by the system"}.
          </div>
        )}

        <div className="mt-5 space-y-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isCurrent = current === opt.state;
            return (
              <Button
                key={opt.state}
                variant="outline"
                className={`w-full justify-start gap-2 h-11 ${isCurrent ? opt.active : ""}`}
                disabled={saving !== null}
                onClick={() => apply(opt)}
              >
                {saving === opt.state ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {opt.label}
                {isCurrent && saving === null && <Check className="h-4 w-4 ml-auto" />}
              </Button>
            );
          })}
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          Changes apply immediately and are approved automatically.
        </p>
      </SheetContent>
    </Sheet>
  );
}
