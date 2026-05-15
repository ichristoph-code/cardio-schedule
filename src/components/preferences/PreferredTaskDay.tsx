"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAY_OPTIONS = [
  { value: "", label: "No preference" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
];

const selectClassName =
  "flex h-9 w-full max-w-xs items-center rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[13px] shadow-[0_0.5px_1px_rgba(0,0,0,0.04)] transition-all duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-input dark:bg-input/30";

interface PreferredTaskDayProps {
  initialPreferredDay: number | null;
  /** When set, the component operates on behalf of this physician (admin mode) */
  physicianId?: string;
}

export function PreferredTaskDay({
  initialPreferredDay,
  physicianId,
}: PreferredTaskDayProps) {
  const [selectedDay, setSelectedDay] = useState<string>(
    initialPreferredDay != null ? String(initialPreferredDay) : ""
  );
  const [savedDay, setSavedDay] = useState<string>(
    initialPreferredDay != null ? String(initialPreferredDay) : ""
  );
  const [saving, setSaving] = useState(false);

  const isDirty = selectedDay !== savedDay;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/preferred-task-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredTaskDay: selectedDay ? Number(selectedDay) : null,
          ...(physicianId ? { physicianId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save preference");
        return;
      }

      setSavedDay(selectedDay);
      toast.success(
        selectedDay
          ? `Preferred task day set to ${DAY_OPTIONS.find((d) => d.value === selectedDay)?.label}`
          : "Preferred task day cleared"
      );
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle>Preferred Task Day</CardTitle>
        </div>
        <CardDescription>
          {physicianId
            ? "Set this physician's preferred weekday for daytime and reading tasks (echoes, MPIs, clinic days). The scheduler treats this as a soft preference — it won't override harder constraints or large workload imbalances."
            : "Choose a weekday you'd like to concentrate your daytime and reading tasks (echoes, MPIs, clinic days). This is a soft preference — the scheduler will favor this day all else being equal, but won't override other constraints."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className={selectClassName}
          >
            {DAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button onClick={handleSave} disabled={!isDirty || saving} size="sm">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
