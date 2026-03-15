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
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  // Role summary counts
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assignments) {
      counts[a.roleDisplayName] = (counts[a.roleDisplayName] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
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

    return (
      <Card
        key={dateStr}
        className={`shadow-sm ${isToday ? "ring-2 ring-primary" : ""}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-[100px]">
              <div className={`text-sm font-medium ${isToday ? "text-primary" : ""}`}>
                {dayName.slice(0, 3)}, {MONTH_NAMES[d.getMonth()].slice(0, 3)}{" "}
                {d.getDate()}
              </div>
              {isToday && (
                <span className="text-xs text-primary font-medium">Today</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {dayAssigns.map((a) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className={`text-xs ${CATEGORY_COLORS[a.roleCategory] ?? ""}`}
                >
                  {a.roleDisplayName}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calendar view — delegates to PhysicianCalendar component
  if (viewMode === "calendar") {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("upcoming")}
          >
            Upcoming
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("month")}
          >
            By Month
          </Button>
          <Button variant="default" size="sm">
            Calendar
          </Button>
        </div>

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
    <div className="space-y-4">
      {/* Summary */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {year} Assignment Summary
          </h3>
          <div className="flex flex-wrap gap-3">
            {roleCounts.map(([role, count]) => (
              <div key={role} className="text-center">
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{role}</div>
              </div>
            ))}
            <div className="text-center border-l pl-3">
              <div className="text-xl font-bold">{assignments.length}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("upcoming")}
          >
            Upcoming
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
          >
            By Month
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("calendar")}
          >
            Calendar
          </Button>
        </div>
        {viewMode === "month" && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonth((m) => Math.max(0, m - 1))}
              disabled={month === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(month)} onValueChange={(v) => v !== null && setMonth(Number(v))}>
              <SelectTrigger className="w-[140px] h-8">
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
              className="h-8 w-8"
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
            <p className="text-muted-foreground text-sm py-4 text-center">
              No upcoming assignments.
            </p>
          )
        ) : monthDates.length > 0 ? (
          monthDates.map(renderDateRow)
        ) : (
          <p className="text-muted-foreground text-sm py-4 text-center">
            No assignments in {MONTH_NAMES[month]}.
          </p>
        )}
      </div>
    </div>
  );
}
