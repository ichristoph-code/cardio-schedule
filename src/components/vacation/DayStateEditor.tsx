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
import { Loader2, Check, PartyPopper, Trash2, RotateCcw } from "lucide-react";
import { DAY_TYPE_OPTIONS, type DayState, type DayTypeOption } from "@/components/vacation/day-types";
import { toast } from "sonner";

export type { DayState };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  physicianId: string;
  physicianName: string;
  year: number;
  date: string; // YYYY-MM-DD
  current: DayState;
  holidayName?: string;
  /** True when the holiday on this date was added by an admin (can rename/delete). */
  isCustomHoliday?: boolean;
  /** Set to the original holiday name when a built-in holiday has been hidden by an admin. */
  hiddenBuiltInName?: string;
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
  isCustomHoliday = false,
  hiddenBuiltInName,
  callSource,
  onClose,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<DayState | null>(null);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayInput, setHolidayInput] = useState(isCustomHoliday ? holidayName ?? "" : "");
  const busy = saving !== null || holidaySaving;

  const d = new Date(date + "T12:00:00");
  const dayLabel = `${DAY_LABELS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  async function apply(opt: DayTypeOption) {
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
  async function setHoliday(action: "POST" | "DELETE" | "HIDE") {
    if (busy) return;
    setHolidaySaving(true);
    try {
      const method = action === "DELETE" ? "DELETE" : "POST";
      const body =
        action === "HIDE"
          ? { date, name: holidayName ?? hiddenBuiltInName ?? "Holiday", hidden: true }
          : action === "POST"
          ? { date, name: holidayInput }
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
      const msg =
        action === "HIDE" ? "Holiday removed from all calendars" :
        action === "DELETE" ? (hiddenBuiltInName ? "Holiday restored" : "Holiday removed") :
        "Holiday set for all physicians";
      toast.success(msg);
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
                {isCustomHoliday ? "(added by admin)" : "(built-in)"}
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
          {DAY_TYPE_OPTIONS.map((opt) => {
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
            Applies to every physician&apos;s calendar, not just {physicianName.split(" ")[0] || "this physician"}.
          </p>

          {/* Case 1: admin-added custom holiday — can rename or delete */}
          {isCustomHoliday && (
            <div className="mt-3 flex gap-2">
              <Input
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
                placeholder="Holiday name"
                maxLength={60}
                disabled={busy}
                aria-label="Holiday name"
              />
              <Button variant="outline" disabled={busy || !holidayInput.trim()} onClick={() => setHoliday("POST")}>
                Rename
              </Button>
              <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setHoliday("DELETE")}>
                {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          )}

          {/* Case 2: visible built-in holiday — can remove it globally */}
          {!isCustomHoliday && holidayName && !hiddenBuiltInName && (
            <div className="mt-3">
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={busy}
                onClick={() => setHoliday("HIDE")}
              >
                {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove {holidayName} from all calendars
              </Button>
            </div>
          )}

          {/* Case 3: built-in holiday that an admin removed — can restore it */}
          {hiddenBuiltInName && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-destructive">{hiddenBuiltInName}</span> has been removed from all calendars.
              </p>
              <Button
                variant="outline"
                className="gap-2"
                disabled={busy}
                onClick={() => setHoliday("DELETE")}
              >
                {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Restore {hiddenBuiltInName}
              </Button>
            </div>
          )}

          {/* Case 4: no holiday on this date — can mark one */}
          {!isCustomHoliday && !holidayName && !hiddenBuiltInName && (
            <div className="mt-3 flex gap-2">
              <Input
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
                placeholder="Holiday name (e.g. Practice Retreat)"
                maxLength={60}
                disabled={busy}
                aria-label="Holiday name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) setHoliday("POST");
                }}
              />
              <Button
                variant="outline"
                className="shrink-0 gap-2 border-yellow-300 bg-yellow-100 text-yellow-900 hover:bg-yellow-200 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                disabled={busy}
                onClick={() => setHoliday("POST")}
              >
                {holidaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
                Mark holiday
              </Button>
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
