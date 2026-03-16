"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Clock,
  Activity,
  Palmtree,
} from "lucide-react";
import { PhysicianCalendar } from "@/components/physicians/PhysicianCalendar";

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

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

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

const CATEGORY_ICON_COLOR: Record<string, string> = {
  ON_CALL: "text-red-500",
  DAYTIME: "text-blue-500",
  READING: "text-emerald-500",
  SPECIAL: "text-purple-500",
};

export function MyScheduleView({
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
  const [viewMode, setViewMode] = useState<"upcoming" | "month" | "calendar">(
    "calendar"
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return map;
  }, [assignments]);

  // Role summary counts with category
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

  const todayStr = now.toISOString().split("T")[0];

  // Upcoming: next 30 days with assignments
  const upcomingDates = useMemo(() => {
    const dates: string[] = [];
    const sorted = [...byDate.keys()].sort();
    for (const d of sorted) {
      if (d >= todayStr) dates.push(d);
      if (dates.length >= 30) break;
    }
    return dates;
  }, [byDate, todayStr]);

  // Month dates with assignments
  const monthDates = useMemo(() => {
    const dates: string[] = [];
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const sorted = [...byDate.keys()].sort();
    for (const d of sorted) {
      if (d.startsWith(prefix)) dates.push(d);
    }
    return dates;
  }, [byDate, year, month]);

  function renderDateRow(dateStr: string) {
    const dayAssigns = byDate.get(dateStr) ?? [];
    const d = new Date(dateStr + "T12:00:00");
    const isToday = dateStr === todayStr;
    const dayName = DAY_NAMES[d.getDay()];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    return (
      <div
        key={dateStr}
        className={`rounded-xl border p-3.5 transition-all hover:shadow-md ${
          isToday
            ? "ring-2 ring-primary bg-primary/5 border-primary/20"
            : isWeekend
              ? "bg-slate-50/80 dark:bg-slate-900/20"
              : "bg-white dark:bg-background"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Prominent date circle */}
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                isToday
                  ? "bg-primary text-white shadow-sm"
                  : "bg-muted/60 text-foreground"
              }`}
            >
              {d.getDate()}
            </div>
            <div>
              <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                {dayName}
              </div>
              <div className="text-xs text-muted-foreground">
                {MONTH_NAMES[d.getMonth()].slice(0, 3)} {d.getDate()}, {d.getFullYear()}
              </div>
              {isToday && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  Today
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {dayAssigns.map((a) => (
              <Badge
                key={a.id}
                variant="outline"
                className={`text-xs ${CATEGORY_COLORS[a.roleCategory] ?? ""}`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${CATEGORY_DOT[a.roleCategory] ?? ""}`} />
                {a.roleDisplayName}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // View mode toggle buttons
  const viewToggle = (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
      <Button
        variant={viewMode === "upcoming" ? "default" : "ghost"}
        size="sm"
        className="gap-1.5 h-8 rounded-md"
        onClick={() => setViewMode("upcoming")}
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Upcoming</span>
      </Button>
      <Button
        variant={viewMode === "month" ? "default" : "ghost"}
        size="sm"
        className="gap-1.5 h-8 rounded-md"
        onClick={() => setViewMode("month")}
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">By Month</span>
      </Button>
      <Button
        variant={viewMode === "calendar" ? "default" : "ghost"}
        size="sm"
        className="gap-1.5 h-8 rounded-md"
        onClick={() => setViewMode("calendar")}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Calendar</span>
      </Button>
    </div>
  );

  // Calendar view — delegates to PhysicianCalendar component
  if (viewMode === "calendar") {
    return (
      <div className="space-y-4">
        <div className="no-print">{viewToggle}</div>

        <PhysicianCalendar
          year={year}
          physicianName={physicianName}
          assignments={assignments}
          vacations={vacations}
          noCallDays={noCallDays}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary — colorful stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {roleCounts.map(([role, { count, category }]) => (
          <div
            key={role}
            className="rounded-xl border p-3.5 bg-white dark:bg-background transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[category] ?? "bg-gray-400"}`} />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                {role}
              </span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${CATEGORY_ICON_COLOR[category] ?? ""}`}>
              {count}
            </div>
          </div>
        ))}
        <div className="rounded-xl border p-3.5 bg-primary/5 dark:bg-primary/10 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-primary">
            {assignments.length}
          </div>
        </div>
      </div>

      {/* View toggle + month nav */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {viewToggle}
        {viewMode === "month" && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setMonth((m) => Math.max(0, m - 1))}
              disabled={month === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(month)} onValueChange={(v) => v !== null && setMonth(Number(v))}>
              <SelectTrigger className="w-[140px] h-8 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setMonth((m) => Math.min(11, m + 1))}
              disabled={month === 11}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Assignment list */}
      <div className="space-y-2">
        {viewMode === "upcoming" ? (
          upcomingDates.length > 0 ? (
            upcomingDates.map(renderDateRow)
          ) : (
            <div className="text-center py-12">
              <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm font-medium">
                No upcoming assignments
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Your schedule is clear for the next 30 days.
              </p>
            </div>
          )
        ) : monthDates.length > 0 ? (
          monthDates.map(renderDateRow)
        ) : (
          <div className="text-center py-12">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm font-medium">
              No assignments in {MONTH_NAMES[month]}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
