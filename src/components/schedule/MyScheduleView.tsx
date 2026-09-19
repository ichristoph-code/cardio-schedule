"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  LayoutGrid,
  List,
  Clock,
  Activity,
  Palmtree,
  Filter,
} from "lucide-react";
import { PhysicianCalendar } from "@/components/physicians/PhysicianCalendar";
import { PersonalYearCalendar } from "@/components/schedule/PersonalYearCalendar";
import { SegmentedControl } from "@/components/calendar/SegmentedControl";
import { CATEGORY_COLORS } from "@/lib/colors";
import type { CustomHolidayInfo } from "@/lib/holidays";

interface Assignment {
  id: string;
  date: string;
  roleName: string;
  roleDisplayName: string;
  roleCategory: string;
  source: string;
}

interface VacationInfo {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  halfDay?: string | null;
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
  assignments: allAssignments,
  vacations = [],
  noCallDays = [],
  customHolidays = [],
}: {
  year: number;
  physicianName: string;
  assignments: Assignment[];
  vacations?: VacationInfo[];
  noCallDays?: NoCallDayInfo[];
  customHolidays?: CustomHolidayInfo[];
}) {
  const now = new Date();
  const [month, setMonth] = useState(
    now.getFullYear() === year ? now.getMonth() : 0
  );
  // "year" is the same grid as the Physician Calendar and the
  // default, so the two calendars a physician sees open on the same picture.
  const [viewMode, setViewMode] = useState<"year" | "month" | "upcoming" | "list">("year");

  // Show/hide roles, the same control as the Group Schedule's "Filter Roles".
  // Every view below draws from `assignments`, so one filter covers them all.
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(new Set());
  const [showRoleFilter, setShowRoleFilter] = useState(false);

  const roles = useMemo(() => {
    const byName = new Map<string, string>();
    for (const a of allAssignments) byName.set(a.roleName, a.roleDisplayName);
    return [...byName].map(([name, displayName]) => ({ name, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [allAssignments]);

  const assignments = useMemo(
    () => hiddenRoles.size === 0 ? allAssignments : allAssignments.filter((a) => !hiddenRoles.has(a.roleName)),
    [allAssignments, hiddenRoles],
  );

  function toggleRole(roleName: string) {
    setHiddenRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleName)) next.delete(roleName);
      else next.add(roleName);
      return next;
    });
  }

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

  const viewToggle = (
    <div className="flex items-center gap-2 flex-wrap">
      <SegmentedControl
        value={viewMode}
        onChange={setViewMode}
        segments={[
          { value: "year", label: "Full Year", icon: LayoutGrid },
          { value: "month", label: "Monthly", icon: CalendarDays },
          { value: "upcoming", label: "Upcoming", icon: Clock },
          { value: "list", label: "List", icon: List },
        ]}
      />
      {roles.length > 0 && (
        <Button
          variant={hiddenRoles.size > 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setShowRoleFilter((v) => !v)}
        >
          <Filter className="h-4 w-4 mr-1" />
          Filter Roles
          {hiddenRoles.size > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
              {roles.length - hiddenRoles.size}/{roles.length}
            </Badge>
          )}
        </Button>
      )}
    </div>
  );

  const roleFilterPanel = showRoleFilter && (
    <Card className="no-print">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Show/hide roles</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setHiddenRoles(new Set())}>
              Show All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => setHiddenRoles(new Set(roles.map((r) => r.name)))}
            >
              Hide All
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {roles.map((role) => (
            <div key={role.name} className="flex items-center gap-2">
              <Checkbox
                id={`role-${role.name}`}
                checked={!hiddenRoles.has(role.name)}
                onCheckedChange={() => toggleRole(role.name)}
              />
              <label htmlFor={`role-${role.name}`} className="text-sm cursor-pointer">
                {role.displayName}
              </label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  if (viewMode === "year" || viewMode === "month") {
    return (
      <div className="space-y-4">
        <div className="no-print">{viewToggle}</div>
        {roleFilterPanel}

        {viewMode === "year" ? (
          <PersonalYearCalendar
            year={year}
            assignments={assignments}
            vacations={vacations}
            noCallDays={noCallDays.map((nc) => nc.date)}
            customHolidays={customHolidays}
          />
        ) : (
          <PhysicianCalendar
            year={year}
            physicianName={physicianName}
            assignments={assignments}
            vacations={vacations}
            noCallDays={noCallDays}
            customHolidays={customHolidays}
          />
        )}
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
        {viewMode === "list" && (
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
            {(now.getFullYear() !== year || month !== now.getMonth()) && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 rounded-full px-3 ml-1"
                onClick={() => setMonth(now.getFullYear() === year ? now.getMonth() : 0)}
              >
                {now.getFullYear() === year ? "Today" : `Jan ${year}`}
              </Button>
            )}
          </div>
        )}
      </div>
      {roleFilterPanel}

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
