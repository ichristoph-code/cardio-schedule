"use client";

import { useState } from "react";
import { DayStateEditor, type DayState } from "@/components/vacation/DayStateEditor";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

/** Returns a Map of "YYYY-MM-DD" → holiday name (the holidays the scheduler recognizes). */
function getHolidayDatesForYear(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Federal "in lieu of" observance: Saturday -> preceding Friday, Sunday -> following Monday.
  const observed = (d: Date) => {
    const r = new Date(d);
    const dow = r.getDay();
    if (dow === 6) r.setDate(r.getDate() - 1);
    else if (dow === 0) r.setDate(r.getDate() + 1);
    return r;
  };

  map.set(fmt(observed(new Date(year, 0, 1))), "New Year's Day");
  map.set(fmt(observed(new Date(year, 6, 4))), "Independence Day");

  // Christmas Eve stays on Dec 24; Christmas Day follows the federal rule.
  // When observed Christmas Day lands on Dec 24, shift the Eve one weekday earlier.
  const christmasDay = observed(new Date(year, 11, 25));
  const christmasEve = new Date(year, 11, 24);
  if (fmt(christmasDay) === fmt(christmasEve)) {
    christmasEve.setDate(christmasEve.getDate() - 1);
    while (christmasEve.getDay() === 0 || christmasEve.getDay() === 6) {
      christmasEve.setDate(christmasEve.getDate() - 1);
    }
  }
  map.set(fmt(christmasEve), "Christmas Eve");
  map.set(fmt(christmasDay), "Christmas Day");

  const memDay = new Date(year, 4, 31);
  while (memDay.getDay() !== 1) memDay.setDate(memDay.getDate() - 1);
  map.set(fmt(memDay), "Memorial Day");

  const labDay = new Date(year, 8, 1);
  while (labDay.getDay() !== 1) labDay.setDate(labDay.getDate() + 1);
  map.set(fmt(labDay), "Labor Day");

  const tg = new Date(year, 10, 1);
  while (tg.getDay() !== 4) tg.setDate(tg.getDate() + 1);
  tg.setDate(tg.getDate() + 21);
  map.set(fmt(tg), "Thanksgiving");

  return map;
}

interface VacationInfo {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  halfDay?: string | null;
}

interface Props {
  year: number;
  vacations: VacationInfo[];
  floatDays?: string[];
  rounderDays?: string[];
  callDays?: { date: string; manual: boolean }[];
  noCallDays?: string[];
  daysWorked?: number;
  isAdmin?: boolean;
  physicianId?: string;
  physicianName?: string;
}

type VacState = "VACATION" | "HALF_AM" | "HALF_PM";

/** Expand vacation ranges into a per-day map of vacation state (full vs AM/PM half). */
function buildVacationStateMap(vacations: VacationInfo[]): Map<string, VacState> {
  const map = new Map<string, VacState>();
  for (const v of vacations) {
    const start = new Date(v.startDate + "T12:00:00");
    const end = new Date(v.endDate + "T12:00:00");
    const state: VacState =
      v.halfDay === "MORNING" ? "HALF_AM" : v.halfDay === "AFTERNOON" ? "HALF_PM" : "VACATION";
    const cur = new Date(start);
    while (cur <= end) {
      const key = cur.toISOString().split("T")[0];
      map.set(key, state);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

function MonthGrid({
  year,
  month,
  vacMap,
  floatSet,
  rounderSet,
  callMap,
  noCallSet,
  holidays,
  isAdmin,
  onSelect,
}: {
  year: number;
  month: number;
  vacMap: Map<string, VacState>;
  floatSet: Set<string>;
  rounderSet: Set<string>;
  callMap: Map<string, boolean>; // date -> manual? (true = manually set, false = system-assigned)
  noCallSet: Set<string>;
  holidays: Map<string, string>;
  isAdmin: boolean;
  onSelect: (date: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white dark:bg-card rounded-xl border p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-center mb-3 text-foreground">
        {MONTH_NAMES[month]}
      </h3>
      <div className="grid grid-cols-7 gap-px">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-[10px] text-center text-muted-foreground font-medium pb-1">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const vac = vacMap.get(dateStr);
          const call = callMap.get(dateStr); // undefined | true (manual) | false (auto)
          const isCall = call !== undefined;
          const isFloat = floatSet.has(dateStr);
          const isRounder = rounderSet.has(dateStr);
          const isNoCall = noCallSet.has(dateStr);
          const holidayName = holidays.get(dateStr);
          const isToday = dateStr === today;

          // Manual call gets an amber ring so system- vs manually-set is visible
          // at a glance — but only when call is the displayed state (not when a
          // vacation/half overrides it).
          const callRing = !vac && call === true ? " ring-2 ring-inset ring-amber-400" : "";

          const className = [
            "text-[11px] text-center rounded py-[3px] leading-none select-none",
            isAdmin ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : "",
            (vac === "VACATION"
              ? "bg-emerald-500 text-white font-semibold"
              : vac === "HALF_AM" || vac === "HALF_PM"
                ? "bg-emerald-200 text-emerald-900 font-semibold"
                : isCall
                  ? "bg-neutral-900 text-white font-semibold"
                  : isFloat
                    ? "bg-blue-400 text-white font-semibold"
                    : isRounder
                      ? "bg-purple-400 text-white font-semibold"
                      : isNoCall
                        ? "bg-slate-400 text-white font-semibold"
                        : holidayName
                          ? "bg-yellow-300 text-yellow-900 font-semibold"
                          : isToday
                            ? "bg-primary/15 text-primary font-bold"
                            : "text-foreground hover:bg-muted/50") + callRing,
          ].join(" ");

          const title =
            vac === "HALF_AM" ? "Half day (AM)"
            : vac === "HALF_PM" ? "Half day (PM)"
            : vac === "VACATION" ? "Vacation day"
            : isCall ? (call ? "General Call (manually set)" : "General Call (system-assigned)")
            : isFloat ? "Hospital Float"
            : isRounder ? "ICU Rounder"
            : isNoCall ? "No-call day"
            : holidayName ?? undefined;

          const content = (vac === "HALF_AM" || vac === "HALF_PM")
            ? <>{day}<span className="text-[8px] align-super ml-px">{vac === "HALF_AM" ? "AM" : "PM"}</span></>
            : day;

          if (isAdmin) {
            return (
              <button key={i} type="button" title={title} className={className} onClick={() => onSelect(dateStr)}>
                {content}
              </button>
            );
          }
          return (
            <div key={i} title={title} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function YearlyVacationCalendar({
  year,
  vacations,
  floatDays = [],
  rounderDays = [],
  callDays = [],
  noCallDays = [],
  daysWorked,
  isAdmin = false,
  physicianId,
  physicianName,
}: Props) {
  const vacMap = buildVacationStateMap(vacations);
  const floatSet = new Set(floatDays);
  const rounderSet = new Set(rounderDays);
  const callMap = new Map(callDays.map((c) => [c.date, c.manual] as const));
  const noCallSet = new Set(noCallDays);
  const holidays = getHolidayDatesForYear(year);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const totalFull = [...vacMap.values()].filter((v) => v === "VACATION").length;
  const totalHalf = [...vacMap.values()].filter((v) => v === "HALF_AM" || v === "HALF_PM").length;

  // Current type of the day being edited (for highlighting in the editor).
  const selectedState: DayState = selectedDate
    ? (vacMap.get(selectedDate)
        ?? (callMap.has(selectedDate)
          ? "CALL"
          : floatSet.has(selectedDate)
            ? "FLOAT"
            : rounderSet.has(selectedDate)
              ? "ROUNDER"
              : noCallSet.has(selectedDate)
                ? "NO_CALL"
                : "NONE"))
    : "NONE";
  const selectedCallSource: "AUTO" | "MANUAL" | undefined =
    selectedDate && callMap.has(selectedDate)
      ? (callMap.get(selectedDate) ? "MANUAL" : "AUTO")
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-muted-foreground">Full day — <strong>{totalFull}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200" />
          <span className="text-muted-foreground">Half day — <strong>{totalHalf}</strong></span>
        </div>
        <div className="text-muted-foreground">
          Vacation total: <strong>{totalFull + totalHalf * 0.5}</strong> days
        </div>
        {daysWorked !== undefined && (
          <div className="text-muted-foreground">
            Days worked: <strong>{daysWorked}</strong>
          </div>
        )}
        {floatDays.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" />
            <span className="text-muted-foreground">Hospital Float — <strong>{floatDays.length}</strong></span>
          </div>
        )}
        {rounderDays.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-purple-400" />
            <span className="text-muted-foreground">ICU Rounder — <strong>{rounderDays.length}</strong></span>
          </div>
        )}
        {callDays.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-neutral-900" />
            <span className="text-muted-foreground">General Call — <strong>{callDays.length}</strong></span>
          </div>
        )}
        {callDays.some((c) => c.manual) && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-neutral-900 ring-2 ring-inset ring-amber-400" />
            <span className="text-muted-foreground">Call — manually set</span>
          </div>
        )}
        {noCallDays.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-slate-400" />
            <span className="text-muted-foreground">No-call — <strong>{noCallDays.length}</strong></span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-300" />
          <span className="text-muted-foreground">Federal holiday</span>
        </div>
      </div>

      {isAdmin && (
        <p className="text-xs text-muted-foreground -mt-1">
          Click any day to set vacation, ½ day, float, rounder, general call, or no-call.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            vacMap={vacMap}
            floatSet={floatSet}
            rounderSet={rounderSet}
            callMap={callMap}
            noCallSet={noCallSet}
            holidays={holidays}
            isAdmin={isAdmin}
            onSelect={setSelectedDate}
          />
        ))}
      </div>

      {isAdmin && physicianId && selectedDate && (
        <DayStateEditor
          physicianId={physicianId}
          physicianName={physicianName ?? ""}
          year={year}
          date={selectedDate}
          current={selectedState}
          holidayName={holidays.get(selectedDate)}
          callSource={selectedCallSource}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
