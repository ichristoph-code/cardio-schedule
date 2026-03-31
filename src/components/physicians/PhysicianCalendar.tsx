"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Stethoscope,
  Sun,
  Moon,
  Palmtree,
  PhoneOff,
  CalendarHeart,
  Activity,
} from "lucide-react";

// --- Types ---

interface Assignment {
  id: string;
  date: string;
  roleDisplayName: string;
  roleCategory: string;
  source: string;
}

interface VacationInfo {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

interface NoCallDayInfo {
  id: string;
  date: string;
  reason: string | null;
}

// --- Constants ---

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CATEGORY_COLORS: Record<string, string> = {
  ON_CALL: "bg-red-100 text-red-800 border-red-200",
  DAYTIME: "bg-blue-100 text-blue-800 border-blue-200",
  READING: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SPECIAL: "bg-purple-100 text-purple-800 border-purple-200",
};

const CATEGORY_DOT: Record<string, string> = {
  ON_CALL: "bg-red-500",
  DAYTIME: "bg-blue-500",
  READING: "bg-emerald-500",
  SPECIAL: "bg-purple-500",
};

const CATEGORY_BG: Record<string, string> = {
  ON_CALL: "bg-red-50 dark:bg-red-950/30",
  DAYTIME: "bg-blue-50 dark:bg-blue-950/30",
  READING: "bg-emerald-50 dark:bg-emerald-950/30",
  SPECIAL: "bg-purple-50 dark:bg-purple-950/30",
};

const CATEGORY_ICON_COLOR: Record<string, string> = {
  ON_CALL: "text-red-500",
  DAYTIME: "text-blue-500",
  READING: "text-emerald-500",
  SPECIAL: "text-purple-500",
};

// --- Helpers ---

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dayOfWeekSun(y: number, m: number, d: number): number {
  return new Date(y, m, d).getDay();
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

/** Shorten long role names for calendar cells */
function shortRoleName(name: string): string {
  // Common abbreviations for readability in small cells
  return name
    .replace("Interventional Call", "Intv Call")
    .replace("Interventional", "Intv")
    .replace("Hospital Rounder", "Hosp Rnd")
    .replace("ICU Rounder", "ICU Rnd")
    .replace("Cardioversion / TEE", "CV/TEE")
    .replace("Doc in the Box", "DITB")
    .replace("CT FFR Reader", "CT FFR")
    .replace("ECG Reader", "ECG")
    .replace("MPI Reader", "MPI")
    .replace("Echo Reader", "Echo")
    .replace("General Call", "Gen Call");
}

/** Returns a Map of "YYYY-MM-DD" → holiday name */
function getHolidayDatesForYear(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  map.set(fmt(new Date(year, 0, 1)), "New Year's Day");
  map.set(fmt(new Date(year, 6, 4)), "Independence Day");
  map.set(fmt(new Date(year, 11, 24)), "Christmas Eve");
  map.set(fmt(new Date(year, 11, 25)), "Christmas Day");

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

// --- Component ---

export function PhysicianCalendar({
  year,
  physicianName,
  assignments,
  vacations = [],
  noCallDays = [],
}: {
  year: number;
  physicianName: string;
  assignments: Assignment[];
  vacations?: VacationInfo[];
  noCallDays?: NoCallDayInfo[];
}) {
  const now = new Date();
  const [month, setMonth] = useState(
    now.getFullYear() === year ? now.getMonth() : 0
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Holiday lookup
  const holidays = useMemo(() => getHolidayDatesForYear(year), [year]);

  // Index assignments by date
  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return map;
  }, [assignments]);

  // Expand vacation ranges into a set of individual days
  const vacationDays = useMemo(() => {
    const days = new Map<string, VacationInfo>();
    for (const v of vacations) {
      const start = new Date(v.startDate + "T12:00:00");
      const end = new Date(v.endDate + "T12:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        days.set(dateStr, v);
      }
    }
    return days;
  }, [vacations]);

  // Index no-call days
  const noCallDaySet = useMemo(() => {
    const map = new Map<string, NoCallDayInfo>();
    for (const nc of noCallDays) {
      map.set(nc.date, nc);
    }
    return map;
  }, [noCallDays]);

  // Summary stats
  const roleCounts = useMemo(() => {
    const counts: Record<string, { count: number; category: string }> = {};
    for (const a of assignments) {
      if (!counts[a.roleDisplayName]) {
        counts[a.roleDisplayName] = { count: 0, category: a.roleCategory };
      }
      counts[a.roleDisplayName].count++;
    }
    return Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  }, [assignments]);

  const totalVacationDays = vacationDays.size;

  // --- Calendar grid ---

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = dayOfWeekSun(year, month, 1);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // --- Day detail sheet ---

  function renderDaySheet() {
    if (!selectedDate) return null;

    const dayAssigns = assignmentsByDate.get(selectedDate) ?? [];
    const vacation = vacationDays.get(selectedDate);
    const noCall = noCallDaySet.get(selectedDate);
    const holidayName = holidays.get(selectedDate);

    const d = new Date(selectedDate + "T12:00:00");
    const dayLabel = `${DAY_LABELS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    return (
      <Sheet open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-xl">{dayLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {holidayName && (
              <Card className="shadow-sm border-rose-300 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40">
                <CardContent className="p-3 flex items-center gap-2">
                  <CalendarHeart className="h-4 w-4 text-rose-500 flex-shrink-0" />
                  <span className="font-semibold text-rose-700 dark:text-rose-300">{holidayName}</span>
                </CardContent>
              </Card>
            )}

            {vacation && (
              <Card className="shadow-sm border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Palmtree className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span className="font-semibold text-amber-700 dark:text-amber-300">Vacation</span>
                  </div>
                  {vacation.reason && (
                    <div className="text-sm text-amber-600 dark:text-amber-400 mt-1 ml-6">
                      {vacation.reason}
                    </div>
                  )}
                  <div className="text-xs text-amber-500 mt-1 ml-6">
                    {vacation.startDate} — {vacation.endDate}
                  </div>
                </CardContent>
              </Card>
            )}

            {noCall && (
              <Card className="shadow-sm border-slate-300 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950/40 dark:to-gray-950/40">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <PhoneOff className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">No Call Day</span>
                  </div>
                  {noCall.reason && (
                    <div className="text-sm text-slate-500 mt-1 ml-6">
                      {noCall.reason}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {dayAssigns.length > 0 ? (
              dayAssigns.map((a) => (
                <Card key={a.id} className={`shadow-sm border ${CATEGORY_BG[a.roleCategory] ?? ""}`}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${CATEGORY_DOT[a.roleCategory] ?? "bg-gray-400"}`} />
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_COLORS[a.roleCategory] ?? ""}`}
                    >
                      {a.roleDisplayName}
                    </Badge>
                    {a.source === "MANUAL" && (
                      <span className="text-xs text-amber-600 ml-1">
                        (manually assigned)
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              !vacation &&
              !noCall &&
              !holidayName && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No assignments for this day.
                </p>
              )
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary stats — compact colored cards with print button */}
      <div className="flex items-center justify-between mb-1 no-print">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {year} Summary
        </h4>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 h-7 text-xs">
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {roleCounts.map(([role, { count, category }]) => (
          <div
            key={role}
            className={`rounded-lg border p-2.5 ${CATEGORY_BG[category] ?? "bg-muted/30"}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[category] ?? "bg-gray-400"}`} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {shortRoleName(role)}
              </span>
            </div>
            <div className={`text-xl font-bold tabular-nums ${CATEGORY_ICON_COLOR[category] ?? ""}`}>
              {count}
            </div>
          </div>
        ))}

        {totalVacationDays > 0 && (
          <div className="rounded-lg border p-2.5 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Palmtree className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vacation
              </span>
            </div>
            <div className="text-xl font-bold tabular-nums text-amber-600">
              {totalVacationDays}
            </div>
          </div>
        )}

        <div className="rounded-lg border p-2.5 bg-primary/5 dark:bg-primary/10">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-primary">
            {assignments.length}
          </div>
        </div>
      </div>

      {/* Month navigation — large styled header */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full no-print"
          onClick={() => setMonth((m) => Math.max(0, m - 1))}
          disabled={month === 0}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <h3 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            {MONTH_NAMES[month]}
          </h3>
          <span className="text-2xl font-light text-muted-foreground/60">{year}</span>
          {(now.getFullYear() !== year || month !== now.getMonth()) && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 rounded-full px-3 no-print"
              onClick={() => setMonth(now.getFullYear() === year ? now.getMonth() : 0)}
            >
              {now.getFullYear() === year ? "Today" : `Jan ${year}`}
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full no-print"
          onClick={() => setMonth((m) => Math.min(11, m + 1))}
          disabled={month === 11}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-semibold uppercase tracking-widest py-2.5 ${
              i === 0 || i === 6
                ? "text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-900/10"
                : "text-muted-foreground"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-[1px] bg-border/40 rounded-xl overflow-hidden shadow-sm ring-1 ring-border/40">
        {cells.map((day, idx) => {
          if (day === null) {
            const emptyColIdx = idx % 7;
            const emptyIsWeekend = emptyColIdx === 0 || emptyColIdx === 6;
            return <div key={idx} className={`min-h-[105px] ${emptyIsWeekend ? "bg-slate-50/60 dark:bg-slate-900/15" : "bg-muted/10"}`} />;
          }

          const dateStr = formatDate(year, month, day);
          const dayAssigns = assignmentsByDate.get(dateStr) ?? [];
          const vacation = vacationDays.get(dateStr);
          const noCall = noCallDaySet.get(dateStr);
          const today = isToday(dateStr);
          const colIdx = idx % 7;
          const isWeekend = colIdx === 0 || colIdx === 6;
          const holidayName = holidays.get(dateStr);

          // Determine cell background — layered priority
          let cellBg = isWeekend
            ? "bg-slate-50/60 dark:bg-slate-900/15"
            : "bg-white dark:bg-background";
          if (vacation) cellBg = "bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-yellow-950/20";
          else if (holidayName) cellBg = "bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/20";
          else if (noCall) cellBg = "bg-slate-100/60 dark:bg-slate-900/30";

          return (
            <button
              key={idx}
              className={`min-h-[105px] p-2 text-left hover:brightness-[0.97] active:brightness-95 transition-all cursor-pointer relative group
                ${cellBg}
                ${today ? "ring-2 ring-primary ring-inset" : ""}`}
              onClick={() => setSelectedDate(dateStr)}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`inline-flex items-center justify-center leading-none ${
                    today
                      ? "bg-primary text-white w-7 h-7 rounded-full text-sm font-bold shadow-sm"
                      : isWeekend
                        ? "text-slate-400 dark:text-slate-500 text-sm font-medium"
                        : "text-foreground text-sm font-semibold"
                  }`}
                >
                  {day}
                </span>
                {holidayName && !vacation && (
                  <CalendarHeart className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                )}
              </div>

              {/* Holiday label */}
              {holidayName && (
                <div className="text-[10px] leading-snug font-bold text-rose-500 dark:text-rose-400 truncate mb-1">
                  {holidayName}
                </div>
              )}

              {/* Vacation label */}
              {vacation && (
                <div className="flex items-center gap-1 mb-1">
                  <Palmtree className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span className="text-[11px] leading-snug font-semibold text-amber-600 dark:text-amber-400">
                    Vacation
                  </span>
                </div>
              )}

              {/* No-call label */}
              {noCall && !vacation && (
                <div className="flex items-center gap-1 mb-1">
                  <PhoneOff className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="text-[11px] leading-snug font-medium text-slate-500 dark:text-slate-400">
                    No Call
                  </span>
                </div>
              )}

              {/* Assignments — colored bars */}
              <div className="space-y-0.5">
                {dayAssigns.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className={`rounded px-1.5 py-[2px] text-[11px] leading-snug font-medium truncate border-l-[3px] ${
                      a.roleCategory === "ON_CALL"
                        ? "border-l-red-400 bg-red-50/80 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                        : a.roleCategory === "DAYTIME"
                          ? "border-l-blue-400 bg-blue-50/80 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : a.roleCategory === "READING"
                            ? "border-l-emerald-400 bg-emerald-50/80 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-l-purple-400 bg-purple-50/80 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                    }`}
                  >
                    {shortRoleName(a.roleDisplayName)}
                  </div>
                ))}
                {dayAssigns.length > 4 && (
                  <div className="text-[10px] text-muted-foreground font-medium pl-1">
                    +{dayAssigns.length - 4} more
                  </div>
                )}
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary/20 transition-colors pointer-events-none" />
            </button>
          );
        })}
      </div>

      {/* Legend — styled with colored pills */}
      <div className="flex gap-3 mt-3 text-xs flex-wrap">
        <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/30 rounded-full px-2.5 py-1 border border-rose-200 dark:border-rose-800">
          <CalendarHeart className="w-3 h-3 text-rose-500" />
          <span className="text-rose-700 dark:text-rose-300 font-medium">Holiday</span>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 rounded-full px-2.5 py-1 border border-amber-200 dark:border-amber-800">
          <Palmtree className="w-3 h-3 text-amber-500" />
          <span className="text-amber-700 dark:text-amber-300 font-medium">Vacation</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-full px-2.5 py-1 border border-slate-200 dark:border-slate-700">
          <PhoneOff className="w-3 h-3 text-slate-400" />
          <span className="text-slate-600 dark:text-slate-300 font-medium">No Call</span>
        </div>
        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-full px-2.5 py-1 border border-red-200 dark:border-red-800">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-red-700 dark:text-red-300 font-medium">On-Call</span>
        </div>
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-full px-2.5 py-1 border border-blue-200 dark:border-blue-800">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-blue-700 dark:text-blue-300 font-medium">Daytime</span>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-2.5 py-1 border border-emerald-200 dark:border-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Reading</span>
        </div>
      </div>

      {/* Day detail sheet */}
      {renderDaySheet()}
    </div>
  );
}
