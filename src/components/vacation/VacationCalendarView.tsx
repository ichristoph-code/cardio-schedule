"use client";

import { useState } from "react";
import { PhysicianCalendar } from "@/components/physicians/PhysicianCalendar";
import { YearlyVacationCalendar } from "@/components/vacation/YearlyVacationCalendar";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

interface VacationInfo {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}

interface Props {
  year: number;
  physicianName: string;
  physicianId: string;
  isAdmin: boolean;
  vacations: VacationInfo[];
}

export function VacationCalendarView({ year, physicianName, physicianId, isAdmin, vacations }: Props) {
  const [view, setView] = useState<"monthly" | "yearly">("yearly");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="inline-flex items-center border rounded-lg p-0.5 bg-muted/40">
          {(["monthly", "yearly"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-3 h-7 rounded-md font-medium transition-all",
                view === v
                  ? "bg-white dark:bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v === "monthly" ? <CalendarDays className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              {v === "monthly" ? "Monthly" : "Full Year"}
            </button>
          ))}
        </div>
      </div>

      {view === "monthly" ? (
        <PhysicianCalendar
          key={`${physicianId}-${year}-monthly`}
          year={year}
          physicianName={physicianName}
          physicianId={physicianId}
          isAdmin={isAdmin}
          assignments={[]}
          vacations={vacations}
          noCallDays={[]}
        />
      ) : (
        <YearlyVacationCalendar
          year={year}
          vacations={vacations}
        />
      )}
    </div>
  );
}
