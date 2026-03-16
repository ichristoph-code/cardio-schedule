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
import { BookOpen, Loader2 } from "lucide-react";
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

interface MpiDayPreferenceProps {
  initialPreferredDay: number | null;
  isMpiEligible: boolean;
}

export function MpiDayPreference({
  initialPreferredDay,
  isMpiEligible,
}: MpiDayPreferenceProps) {
  const [selectedDay, setSelectedDay] = useState<string>(
    initialPreferredDay != null ? String(initialPreferredDay) : ""
  );
  const [savedDay, setSavedDay] = useState<string>(
    initialPreferredDay != null ? String(initialPreferredDay) : ""
  );
  const [saving, setSaving] = useState(false);

  if (!isMpiEligible) return null;

  const isDirty = selectedDay !== savedDay;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/mpi-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredDay: selectedDay ? Number(selectedDay) : null,
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
          ? `MPI reading day set to ${DAY_OPTIONS.find((d) => d.value === selectedDay)?.label}`
          : "MPI day preference cleared"
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
          <BookOpen className="h-5 w-5 text-primary" />
          <CardTitle>MPI Reading Day Preference</CardTitle>
        </div>
        <CardDescription>
          Choose your preferred day of the week for MPI reading. The scheduler
          will prioritize assigning you on this day when possible.
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
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving}
            size="sm"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
