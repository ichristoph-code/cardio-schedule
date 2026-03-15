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
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    const counts: Record<string, number> = {};
    for (const a of assignments) {
      counts[a.roleDisplayName] = (counts[a.roleDisplayName] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
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

    const d = new Date(selectedDate + "T12:00:00");
    const dayLabel = `${DAY_LABELS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    return (
      <Sheet open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{dayLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {vacation && (
              <Card className="shadow-sm border-amber-300 bg-amber-50">
                <CardContent className="p-3">
                  <div className="font-medium text-amber-800">Vacation</div>
                  {vacation.reason && (
                    <div className="text-sm text-amber-700 mt-0.5">
                      {vacation.reason}
                    </div>
                  )}
                  <div className="text-xs text-amber-600 mt-1">
                    {vacation.startDate} — {vacation.endDate}
                  </div>
                </CardContent>
              </Card>
            )}

            {noCall && (
              <Card className="shadow-sm border-slate-300 bg-slate-50">
                <CardContent className="p-3">
                  <div className="font-medium text-slate-700">No Call Day</div>
                  {noCall.reason && (
                    <div className="text-sm text-slate-600 mt-0.5">
                      {noCall.reason}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {dayAssigns.length > 0 ? (
              dayAssigns.map((a) => (
                <Card key={a.id} className="shadow-sm">
                  <CardContent className="p-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_COLORS[a.roleCategory] ?? ""}`}
                    >
                      {a.roleDisplayName}
                    </Badge>
                    {a.source === "MANUAL" && (
                      <span className="text-xs text-amber-600 ml-2">
                        (manually assigned)
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              !vacation &&
              !noCall && (
                <p className="text-muted-foreground text-sm">
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
    <div className="space-y-4">
      {/* Summary stats */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {physicianName} — {year} Summary
          </h3>
          <div className="flex flex-wrap gap-3">
            {roleCounts.map(([role, count]) => (
              <div key={role} className="text-center">
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{role}</div>
              </div>
            ))}
            {totalVacationDays > 0 && (
              <div className="text-center border-l pl-3">
                <div className="text-xl font-bold text-amber-600">
                  {totalVacationDays}
                </div>
                <div className="text-xs text-muted-foreground">
                  Vacation Days
                </div>
              </div>
            )}
            <div className="text-center border-l pl-3">
              <div className="text-xl font-bold">{assignments.length}</div>
              <div className="text-xs text-muted-foreground">Total Duties</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMonth((m) => Math.max(0, m - 1))}
          disabled={month === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">
          {MONTH_NAMES[month]} {year}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMonth((m) => Math.min(11, m + 1))}
          disabled={month === 11}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className="bg-muted/30 min-h-[80px]" />;
          }

          const dateStr = formatDate(year, month, day);
          const dayAssigns = assignmentsByDate.get(dateStr) ?? [];
          const vacation = vacationDays.get(dateStr);
          const noCall = noCallDaySet.get(dateStr);
          const today = isToday(dateStr);
          const colIdx = idx % 7;
          const isWeekend = colIdx === 0 || colIdx === 6;

          return (
            <button
              key={idx}
              className={`min-h-[80px] p-1 text-left hover:bg-accent/50 transition-colors cursor-pointer
                ${vacation ? "bg-amber-50" : noCall ? "bg-slate-50" : isWeekend ? "bg-muted/20" : "bg-background"}
                ${today ? "ring-2 ring-primary ring-inset" : ""}`}
              onClick={() => setSelectedDate(dateStr)}
            >
              <div
                className={`text-xs font-medium mb-0.5 ${
                  today ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                {day}
              </div>
              <div className="space-y-px">
                {/* Vacation label */}
                {vacation && (
                  <div className="text-[10px] leading-tight font-medium text-amber-700 truncate">
                    Vacation
                  </div>
                )}

                {/* No-call label */}
                {noCall && !vacation && (
                  <div className="text-[10px] leading-tight font-medium text-slate-500 truncate">
                    No Call
                  </div>
                )}

                {/* Call assignments */}
                {dayAssigns.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-1 text-[10px] leading-tight truncate"
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        CATEGORY_DOT[a.roleCategory] ?? "bg-gray-400"
                      }`}
                    />
                    <span className="truncate">{a.roleDisplayName}</span>
                  </div>
                ))}
                {dayAssigns.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{dayAssigns.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300" />
          Vacation
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-slate-50 border border-slate-300" />
          No Call Day
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          On-Call
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Daytime
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Reading
        </div>
      </div>

      {/* Day detail sheet */}
      {renderDaySheet()}
    </div>
  );
}
