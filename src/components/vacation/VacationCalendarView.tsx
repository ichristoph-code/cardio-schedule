"use client";

import { useState } from "react";
import { PhysicianCalendar } from "@/components/physicians/PhysicianCalendar";
import { YearlyVacationCalendar } from "@/components/vacation/YearlyVacationCalendar";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { SegmentedControl } from "@/components/calendar/SegmentedControl";
import type { CustomHolidayInfo } from "@/lib/holidays";

interface VacationInfo {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  halfDay?: string | null;
}

interface Props {
  year: number;
  physicianName: string;
  physicianId: string;
  isAdmin: boolean;
  vacations: VacationInfo[];
  floatDays?: { date: string; manual: boolean }[];
  callDays?: { date: string; manual: boolean }[];
  noCallDays?: string[];
  customHolidays?: CustomHolidayInfo[];
}

export function VacationCalendarView({ year, physicianName, physicianId, isAdmin, vacations, floatDays = [], callDays = [], noCallDays = [], customHolidays = [] }: Props) {
  const [view, setView] = useState<"monthly" | "yearly">("yearly");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <SegmentedControl
          value={view}
          onChange={setView}
          segments={[
            { value: "monthly", label: "Monthly", icon: CalendarDays },
            { value: "yearly", label: "Full Year", icon: LayoutGrid },
          ]}
        />
      </div>

      {view === "monthly" ? (
        <PhysicianCalendar
          key={`${physicianId}-${year}-monthly`}
          year={year}
          physicianName={physicianName}
          physicianId={physicianId}
          isAdmin={false}
          assignments={floatDays.map(({ date, manual }, i) => ({
            id: `float-${i}`,
            date,
            roleName: "HOSPITAL_FLOAT",
            roleDisplayName: "Hospital Float",
            roleCategory: "DAYTIME",
            source: manual ? "MANUAL" : "AUTO",
          }))}
          vacations={vacations}
          noCallDays={noCallDays.map((date, i) => ({ id: `nocall-${i}`, date, reason: null }))}
          customHolidays={customHolidays}
        />
      ) : (
        <YearlyVacationCalendar
          year={year}
          vacations={vacations}
          floatDays={floatDays}
          callDays={callDays}
          noCallDays={noCallDays}
          customHolidays={customHolidays}
          isAdmin={isAdmin}
          physicianId={physicianId}
          physicianName={physicianName}
        />
      )}
    </div>
  );
}
