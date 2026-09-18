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
import { Input } from "@/components/ui/input";
import { Palmtree, Sun, Moon, Building2, Stethoscope, Phone, PhoneOff, X, Loader2, Check, PartyPopper, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CustomHolidayInfo } from "@/lib/holidays";

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
  /** The holiday shown on the calendar for this date, after admin edits. */
  holidayName?: string;
  /** The built-in (federal) holiday on this date, if any, before admin edits. */
  builtinHolidayName?: string;
  /** The admin's edit row for this date, if any (rename, addition, or hidden). */
  adminHoliday?: CustomHolidayInfo;
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
  builtinHolidayName,
  adminHoliday,
  callSource,
  onClose,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<DayState | null>(null);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayInput, setHolidayInput] = useState(holidayName ?? "");
  const busy = saving !== null || holidaySaving;

  // How this date got its holiday status — drives the labels below.
  const hiddenBuiltin = !!builtinHolidayName && !!adminHoliday?.hidden;
  const holidaySource: "builtin" | "renamed" | "custom" | null = !holidayName
    ? null
    : adminHoliday && !adminHoliday.hidden
      ? builtinHolidayName ? "renamed" : "custom"
      : "builtin";

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

  // Holidays are global (every physician's calendar), so they use their own
  // endpoint rather than the per-physician calendar-day route above.
  // Three operations, all global:
  //   set    → add or rename the holiday on this date
  //   hide   → switch a built-in holiday off (day becomes a normal working day)
  //   reset  → delete the admin edit; a built-in holiday returns to its default
  async function setHoliday(op: "set" | "hide" | "reset") {
    if (busy) return;
    setHolidaySaving(true);
    try {
      const method = op === "reset" ? "DELETE" : "POST";
      const body =
        op === "set" ? { date, name: holidayInput }
        : op === "hide" ? { date, name: holidayName ?? builtinHolidayName ?? "Holiday", hidden: true }
        : { date };
      const res = await fetch("/api/admin/custom-holidays", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update holiday");
      }
      toast.success(
        op === "set" ? "Holiday set for all physicians"
        : op === "hide" ? "Holiday removed for all physicians"
        : builtinHolidayName ? `Restored ${builtinHolidayName}` : "Holiday removed"
      );
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update holiday");
    } finally {
      setHolidaySaving(false);
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
          <div className="mt-3 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
            <PartyPopper className="h-4 w-4 shrink-0" />
            <span>
              {holidayName}
              <span className="ml-1.5 font-normal opacity-70">
                {holidaySource === "custom" ? "(added by admin)"
                  : holidaySource === "renamed" ? `(built-in ${builtinHolidayName}, renamed by admin)`
                  : "(built-in)"}
              </span>
            </span>
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
                disabled={busy}
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

        <div className="mt-6 border-t pt-4">
          <div className="text-sm font-semibold">Holiday</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Applies to every physician&apos;s calendar and to schedule generation, not just {physicianName.split(" ")[0] || "this physician"}. Built-in holidays can be renamed, removed, or restored.
          </p>
          {holidayName ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={holidayInput}
                  onChange={(e) => setHolidayInput(e.target.value)}
                  placeholder="Holiday name"
                  maxLength={60}
                  disabled={busy}
                  aria-label="Holiday name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy && holidayInput.trim()) setHoliday("set");
                  }}
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={busy || !holidayInput.trim() || holidayInput.trim() === holidayName}
                  onClick={() => setHoliday("set")}
                >
                  Rename
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="gap-2 text-destructive"
                  disabled={busy}
                  onClick={() => setHoliday(builtinHolidayName ? "hide" : "reset")}
                  title="Everyone's calendar treats this day as a normal working day"
                >
                  {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove holiday
                </Button>
                {holidaySource === "renamed" && (
                  <Button variant="ghost" disabled={busy} onClick={() => setHoliday("reset")}>
                    Reset to &ldquo;{builtinHolidayName}&rdquo;
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {hiddenBuiltin && (
                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span>Built-in <strong>{builtinHolidayName}</strong> was removed by an admin.</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setHoliday("reset")}>
                    Restore
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={holidayInput}
                  onChange={(e) => setHolidayInput(e.target.value)}
                  placeholder="Holiday name (e.g. Practice Retreat)"
                  maxLength={60}
                  disabled={busy}
                  aria-label="Holiday name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) setHoliday("set");
                  }}
                />
                <Button
                  variant="outline"
                  className="shrink-0 gap-2 border-yellow-300 bg-yellow-100 text-yellow-900 hover:bg-yellow-200 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                  disabled={busy}
                  onClick={() => setHoliday("set")}
                >
                  {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
                  Mark holiday
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          Changes apply immediately and are approved automatically.
        </p>
      </SheetContent>
    </Sheet>
  );
}
