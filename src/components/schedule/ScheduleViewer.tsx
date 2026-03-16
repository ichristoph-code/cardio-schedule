"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Pencil,
  Printer,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

// --- Types ---

interface Assignment {
  id: string;
  date: string;
  physicianId: string;
  physicianName: string;
  physicianLastName: string;
  roleTypeId: string;
  roleName: string;
  roleDisplayName: string;
  roleCategory: string;
  roleSortOrder: number;
  source: string;
}

interface ScheduleInfo {
  id: string;
  year: number;
  status: string;
  generatedAt: string | null;
  publishedAt: string | null;
}

interface RoleType {
  id: string;
  name: string;
  displayName: string;
  category: string;
  sortOrder: number;
}

interface Physician {
  id: string;
  firstName: string;
  lastName: string;
}

// --- Helpers ---

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

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 0=Sun … 6=Sat (standard JS day) */
function dayOfWeekSun(y: number, m: number, d: number): number {
  return new Date(y, m, d).getDay();
}

function getWeekStart(y: number, m: number, d: number): Date {
  const date = new Date(y, m, d);
  const dow = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - dow); // go back to Sunday
  return date;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

/** Returns a Map of "YYYY-MM-DD" → holiday name for all US holidays in the given year */
function getHolidayDatesForYear(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Fixed dates
  map.set(fmt(new Date(year, 0, 1)), "New Year's Day");
  map.set(fmt(new Date(year, 6, 4)), "Independence Day");
  map.set(fmt(new Date(year, 11, 24)), "Christmas Eve");
  map.set(fmt(new Date(year, 11, 25)), "Christmas Day");

  // Memorial Day: last Monday of May
  const memDay = new Date(year, 4, 31);
  while (memDay.getDay() !== 1) memDay.setDate(memDay.getDate() - 1);
  map.set(fmt(memDay), "Memorial Day");

  // Labor Day: first Monday of September
  const labDay = new Date(year, 8, 1);
  while (labDay.getDay() !== 1) labDay.setDate(labDay.getDate() + 1);
  map.set(fmt(labDay), "Labor Day");

  // Thanksgiving: fourth Thursday of November
  const tg = new Date(year, 10, 1);
  while (tg.getDay() !== 4) tg.setDate(tg.getDate() + 1);
  tg.setDate(tg.getDate() + 21);
  map.set(fmt(tg), "Thanksgiving");

  return map;
}

// Physician color palette — maximally distinct colors, ordered for contrast between neighbors
// Removed near-duplicates (sky≈cyan, teal≈emerald, pink≈rose, amber≈orange)
// Using 200-level backgrounds for stronger visual separation
const PHYSICIAN_COLORS = [
  { bg: "bg-blue-200",    text: "text-blue-900",    dot: "bg-blue-600" },
  { bg: "bg-orange-200",  text: "text-orange-900",  dot: "bg-orange-600" },
  { bg: "bg-emerald-200", text: "text-emerald-900", dot: "bg-emerald-600" },
  { bg: "bg-rose-200",    text: "text-rose-900",    dot: "bg-rose-600" },
  { bg: "bg-violet-200",  text: "text-violet-900",  dot: "bg-violet-600" },
  { bg: "bg-yellow-200",  text: "text-yellow-900",  dot: "bg-yellow-600" },
  { bg: "bg-cyan-200",    text: "text-cyan-900",    dot: "bg-cyan-600" },
  { bg: "bg-fuchsia-200", text: "text-fuchsia-900", dot: "bg-fuchsia-600" },
  { bg: "bg-lime-200",    text: "text-lime-900",    dot: "bg-lime-600" },
  { bg: "bg-red-200",     text: "text-red-900",     dot: "bg-red-600" },
  { bg: "bg-indigo-200",  text: "text-indigo-900",  dot: "bg-indigo-600" },
  { bg: "bg-amber-200",   text: "text-amber-900",   dot: "bg-amber-600" },
  { bg: "bg-teal-200",    text: "text-teal-900",    dot: "bg-teal-600" },
  { bg: "bg-pink-200",    text: "text-pink-900",    dot: "bg-pink-600" },
  { bg: "bg-sky-200",     text: "text-sky-900",     dot: "bg-sky-600" },
];

function buildPhysicianColorMap(physicians: Physician[]): Map<string, typeof PHYSICIAN_COLORS[0]> {
  const sorted = [...physicians].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const map = new Map<string, typeof PHYSICIAN_COLORS[0]>();
  sorted.forEach((p, i) => {
    map.set(p.id, PHYSICIAN_COLORS[i % PHYSICIAN_COLORS.length]);
  });
  return map;
}

// --- Main Component ---

export function ScheduleViewer({
  schedule,
  assignments,
  physicians,
  roleTypes,
  isAdmin,
  showBackButton = true,
}: {
  schedule: ScheduleInfo;
  assignments: Assignment[];
  physicians: Physician[];
  roleTypes: RoleType[];
  isAdmin: boolean;
  showBackButton?: boolean;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() === schedule.year ? now.getMonth() : 0;
  });
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    if (now.getFullYear() === schedule.year) {
      const ws = getWeekStart(now.getFullYear(), now.getMonth(), now.getDate());
      return ws;
    }
    // First Monday of the year
    const jan1 = new Date(schedule.year, 0, 1);
    return getWeekStart(schedule.year, 0, jan1.getDate());
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [overrideAssignment, setOverrideAssignment] = useState<Assignment | null>(null);
  const [overridePhysicianId, setOverridePhysicianId] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [localAssignments, setLocalAssignments] = useState(assignments);
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(new Set());
  const [showRoleFilter, setShowRoleFilter] = useState(false);

  // Build physician → color mapping
  const physicianColors = useMemo(() => buildPhysicianColorMap(physicians), [physicians]);

  // Index assignments by date
  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of localAssignments) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    // Sort each day's assignments by role sort order
    for (const list of map.values()) {
      list.sort((a, b) => a.roleSortOrder - b.roleSortOrder);
    }
    return map;
  }, [localAssignments]);

  // Active role types (ones that actually have assignments)
  const activeRoleTypes = useMemo(() => {
    const ids = new Set(localAssignments.map((a) => a.roleTypeId));
    return roleTypes.filter((r) => ids.has(r.id));
  }, [localAssignments, roleTypes]);

  // Visible role types (filtered by checkboxes)
  const visibleRoleTypes = useMemo(
    () => activeRoleTypes.filter((r) => !hiddenRoles.has(r.id)),
    [activeRoleTypes, hiddenRoles]
  );

  // Filtered assignments by date (only visible roles)
  const filteredAssignmentsByDate = useMemo(() => {
    if (hiddenRoles.size === 0) return assignmentsByDate;
    const map = new Map<string, Assignment[]>();
    for (const [date, list] of assignmentsByDate) {
      const filtered = list.filter((a) => !hiddenRoles.has(a.roleTypeId));
      if (filtered.length > 0) map.set(date, filtered);
    }
    return map;
  }, [assignmentsByDate, hiddenRoles]);

  // Group role types by category for the filter panel
  const rolesByCategory = useMemo(() => {
    const groups: Record<string, RoleType[]> = {};
    for (const r of activeRoleTypes) {
      (groups[r.category] ??= []).push(r);
    }
    return groups;
  }, [activeRoleTypes]);

  function toggleRole(roleId: string) {
    setHiddenRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  function toggleCategory(category: string) {
    const roles = rolesByCategory[category] ?? [];
    const allHidden = roles.every((r) => hiddenRoles.has(r.id));
    setHiddenRoles((prev) => {
      const next = new Set(prev);
      for (const r of roles) {
        if (allHidden) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  // --- Handlers ---

  function handlePublish() {
    fetch(`/api/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    }).then((res) => {
      if (res.ok) {
        toast.success("Schedule published!");
        router.refresh();
      } else {
        toast.error("Failed to publish");
      }
    });
  }

  async function handleOverride() {
    if (!overrideAssignment || !overridePhysicianId) return;
    setOverriding(true);
    try {
      const res = await fetch(
        `/api/schedules/${schedule.id}/assignments/${overrideAssignment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ physicianId: overridePhysicianId }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to override");
      }
      const updated = await res.json();
      // Update local state
      setLocalAssignments((prev) =>
        prev.map((a) =>
          a.id === overrideAssignment.id
            ? {
                ...a,
                physicianId: updated.physician.id,
                physicianName: `${updated.physician.firstName} ${updated.physician.lastName}`,
                physicianLastName: updated.physician.lastName,
                source: "MANUAL",
              }
            : a
        )
      );
      toast.success("Assignment updated");
      setOverrideAssignment(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Override failed");
    } finally {
      setOverriding(false);
    }
  }

  // --- Month Calendar ---

  function renderMonthView() {
    const daysInMonth = new Date(schedule.year, month + 1, 0).getDate();
    const firstDow = dayOfWeekSun(schedule.year, month, 1);

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div>
        {/* Month navigation */}
        <div className="flex items-center justify-center gap-1 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMonth((m) => Math.max(0, m - 1))}
            disabled={month === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">
              {MONTH_NAMES[month]} {schedule.year}
            </h3>
            {new Date().getFullYear() === schedule.year && month !== new Date().getMonth() && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setMonth(new Date().getMonth())}
              >
                Today
              </Button>
            )}
          </div>
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
        <div className="grid grid-cols-7 gap-px mb-1">
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

            const dateStr = formatDate(schedule.year, month, day);
            const dayAssignments = filteredAssignmentsByDate.get(dateStr) ?? [];
            const today = isToday(dateStr);
            const colIdx = idx % 7;
            const isWeekend = colIdx === 0 || colIdx === 6;

            return (
              <button
                key={idx}
                className={`bg-background min-h-[80px] p-1 text-left hover:bg-accent/50 transition-colors cursor-pointer
                  ${today ? "ring-2 ring-primary ring-inset" : ""}
                  ${isWeekend ? "bg-muted/20" : ""}`}
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
                  {dayAssignments.slice(0, 4).map((a) => {
                    const pColor = physicianColors.get(a.physicianId);
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-1 text-[10px] leading-tight truncate"
                      >
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            pColor?.dot ?? "bg-gray-400"
                          }`}
                        />
                        <span className={`truncate font-medium ${pColor?.text ?? ""}`}>
                          {a.physicianLastName}
                        </span>
                      </div>
                    );
                  })}
                  {dayAssignments.length > 4 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{dayAssignments.length - 4} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Physician color legend */}
        <div className="flex gap-2 mt-3 text-xs flex-wrap">
          {[...physicianColors.entries()]
            .sort((a, b) => {
              const pA = physicians.find(p => p.id === a[0]);
              const pB = physicians.find(p => p.id === b[0]);
              return (pA?.lastName ?? "").localeCompare(pB?.lastName ?? "");
            })
            .map(([id, color]) => {
              const p = physicians.find(ph => ph.id === id);
              if (!p) return null;
              return (
                <span key={id} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${color.bg} ${color.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  {p.lastName}
                </span>
              );
            })}
        </div>
      </div>
    );
  }

  // --- Week Grid ---

  function renderWeekView() {
    const VISIBLE_DAYS = 31;

    const weekDates: string[] = [];
    const ws = new Date(weekStart);
    for (let i = 0; i < VISIBLE_DAYS; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      weekDates.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }

    // Holiday lookup for the schedule year (and potentially year+1 if range spans Dec→Jan)
    const holidays = getHolidayDatesForYear(schedule.year);
    if (schedule.year + 1 <= new Date().getFullYear() + 2) {
      const nextYearHolidays = getHolidayDatesForYear(schedule.year + 1);
      nextYearHolidays.forEach((v, k) => holidays.set(k, v));
    }

    // Boundaries: allow navigating from the week containing Jan 1
    // through the week containing Dec 31 of the schedule year
    const earliestWeek = getWeekStart(schedule.year, 0, 1);
    const latestWeek = getWeekStart(schedule.year, 11, 31);

    function prevWeek() {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 7);
        return d >= earliestWeek ? d : prev;
      });
    }
    function nextWeek() {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 7);
        return d <= latestWeek ? d : prev;
      });
    }

    const rangeLabel = (() => {
      const s = new Date(weekStart);
      const e = new Date(weekStart);
      e.setDate(e.getDate() + VISIBLE_DAYS - 1);
      return `${MONTH_NAMES[s.getMonth()].slice(0, 3)} ${s.getDate()} \u2013 ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
    })();

    return (
      <div>
        {/* Week navigation */}
        <div className="flex items-center justify-center gap-1 mb-4">
          <Button variant="ghost" size="sm" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold">{rangeLabel}</h3>
          <Button variant="ghost" size="sm" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Grid table */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <table className="w-full border-collapse text-sm min-w-[700px]">
            <thead>
              <tr>
                <th className="border p-2 bg-muted text-left w-[140px] min-w-[140px] sticky left-0 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Role</th>
                {weekDates.map((dateStr) => {
                  const d = new Date(dateStr + "T12:00:00");
                  const dow = d.getDay(); // 0=Sun
                  const today = isToday(dateStr);
                  const isWeekend = dow === 0 || dow === 6;
                  const holidayName = holidays.get(dateStr);
                  return (
                    <th
                      key={dateStr}
                      className={`border p-2 text-center min-w-[90px] ${
                        today
                          ? "bg-primary/10 font-bold"
                          : holidayName
                            ? "bg-rose-100 dark:bg-rose-950/40"
                            : isWeekend
                              ? "bg-slate-200/70 dark:bg-slate-800/50"
                              : "bg-muted"
                      }`}
                      title={holidayName ?? undefined}
                    >
                      <div className="text-xs text-muted-foreground">
                        {DAY_LABELS[dow]}
                      </div>
                      <div>{d.getDate()}</div>
                      {holidayName && (
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium leading-tight mt-0.5 truncate max-w-[80px]">
                          {holidayName}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRoleTypes.map((role) => (
                <tr key={role.id}>
                  <td className="border p-2 sticky left-0 z-10 bg-white dark:bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_COLORS[role.category] ?? ""}`}
                    >
                      {role.displayName}
                    </Badge>
                  </td>
                  {weekDates.map((dateStr) => {
                    const dayAssigns = assignmentsByDate.get(dateStr) ?? [];
                    const assignment = dayAssigns.find(
                      (a) => a.roleTypeId === role.id
                    );
                    const today = isToday(dateStr);
                    const dow = new Date(dateStr + "T12:00:00").getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isHoliday = holidays.has(dateStr);

                    const pColor = assignment ? physicianColors.get(assignment.physicianId) : undefined;

                    return (
                      <td
                        key={dateStr}
                        className={`border p-1 text-center text-xs min-w-[90px] cursor-pointer hover:bg-accent/50 transition-colors
                          ${today ? "bg-primary/5" : isHoliday ? "bg-rose-50 dark:bg-rose-950/20" : isWeekend ? "bg-slate-100 dark:bg-slate-800/30" : ""}
                          ${assignment?.source === "MANUAL" ? "ring-1 ring-inset ring-amber-400" : ""}`}
                        onClick={() => {
                          if (assignment && isAdmin) {
                            setOverrideAssignment(assignment);
                            setOverridePhysicianId(assignment.physicianId);
                          } else {
                            setSelectedDate(dateStr);
                          }
                        }}
                      >
                        {assignment ? (
                          <span className={`inline-block rounded-md px-1.5 py-0.5 font-medium ${pColor?.bg ?? ""} ${pColor?.text ?? ""}`}>
                            {assignment.physicianLastName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600" />
            Weekend
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-rose-100 dark:bg-rose-900 border border-rose-300 dark:border-rose-700" />
            Holiday
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 border border-amber-400 rounded-sm" />
            Manual override
          </div>
          {isAdmin && (
            <div className="italic">Click a cell to override an assignment</div>
          )}
        </div>
      </div>
    );
  }

  // --- Day Detail Sheet ---

  function renderDaySheet() {
    if (!selectedDate) return null;

    const dayAssignments = assignmentsByDate.get(selectedDate) ?? [];
    const d = new Date(selectedDate + "T12:00:00");
    const dayLabel = `${DAY_LABELS[dayOfWeekSun(d.getFullYear(), d.getMonth(), d.getDate())]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    return (
      <Sheet open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{dayLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {dayAssignments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No assignments for this day.
              </p>
            ) : (
              dayAssignments.map((a) => {
                const pColor = physicianColors.get(a.physicianId);
                return (
                <Card key={a.id} className="shadow-sm">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <Badge
                        variant="outline"
                        className={`mb-1 text-xs ${
                          CATEGORY_COLORS[a.roleCategory] ?? ""
                        }`}
                      >
                        {a.roleDisplayName}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${pColor?.dot ?? "bg-gray-400"}`} />
                        <span className={`font-medium ${pColor?.text ?? ""}`}>{a.physicianName}</span>
                      </div>
                      {a.source === "MANUAL" && (
                        <span className="text-xs text-amber-600">
                          (manually assigned)
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setOverrideAssignment(a);
                          setOverridePhysicianId(a.physicianId);
                          setSelectedDate(null);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // --- Override Dialog ---

  function renderOverrideDialog() {
    if (!overrideAssignment) return null;

    const d = new Date(overrideAssignment.date + "T12:00:00");
    const dayLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    return (
      <Dialog
        open={!!overrideAssignment}
        onOpenChange={() => setOverrideAssignment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Assignment</DialogTitle>
            <DialogDescription>
              {overrideAssignment.roleDisplayName} on {dayLabel}
              <br />
              Currently assigned to:{" "}
              <strong>{overrideAssignment.physicianName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Assign to</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              value={overridePhysicianId}
              onChange={(e) => setOverridePhysicianId(e.target.value)}
            >
              <option value="">Select physician</option>
              {physicians.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverrideAssignment(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleOverride} disabled={overriding}>
              {overriding ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Stats Summary ---

  function renderStats() {
    // Group by role category
    const byCategory: Record<string, number> = {};
    for (const a of localAssignments) {
      byCategory[a.roleCategory] = (byCategory[a.roleCategory] ?? 0) + 1;
    }

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(byCategory).map(([cat, count]) => (
          <Card key={cat} className="shadow-sm">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{count.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {cat.replace("_", " ")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // --- Render ---

  const statusBadge = (() => {
    switch (schedule.status) {
      case "DRAFT":
        return <Badge variant="secondary">Draft</Badge>;
      case "PUBLISHED":
        return <Badge className="bg-green-600 hover:bg-green-700">Published</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge>{schedule.status}</Badge>;
    }
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon"
              className="no-print"
              onClick={() => router.push("/dashboard/schedule")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{schedule.year} Schedule</h1>
              {statusBadge}
            </div>
            <p className="text-sm text-muted-foreground">
              {localAssignments.length.toLocaleString()} assignments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="icon" onClick={() => window.print()} title="Print as PDF">
            <Printer className="h-4 w-4" />
          </Button>
          {isAdmin && schedule.status === "DRAFT" && (
            <Button onClick={handlePublish}>
              <Send className="mr-2 h-4 w-4" />
              Publish Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {renderStats()}

      {/* Tabs: Month / Week */}
      <Tabs defaultValue="week">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="week">Week View</TabsTrigger>
            <TabsTrigger value="month">Month View</TabsTrigger>
          </TabsList>
          <Button
            variant={hiddenRoles.size > 0 ? "default" : "outline"}
            size="sm"
            className="no-print"
            onClick={() => setShowRoleFilter((v) => !v)}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filter Roles
            {hiddenRoles.size > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                {activeRoleTypes.length - hiddenRoles.size}/{activeRoleTypes.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Role filter panel */}
        {showRoleFilter && (
          <Card className="mt-2 no-print">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Show/hide roles</p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setHiddenRoles(new Set())}
                  >
                    Show All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() =>
                      setHiddenRoles(new Set(activeRoleTypes.map((r) => r.id)))
                    }
                  >
                    Hide All
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(rolesByCategory).map(([category, roles]) => {
                  const allHidden = roles.every((r) => hiddenRoles.has(r.id));
                  const someHidden = roles.some((r) => hiddenRoles.has(r.id));
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox
                          id={`cat-${category}`}
                          checked={!allHidden}
                          // indeterminate when partially hidden
                          data-state={someHidden && !allHidden ? "indeterminate" : undefined}
                          onCheckedChange={() => toggleCategory(category)}
                        />
                        <label
                          htmlFor={`cat-${category}`}
                          className="text-sm font-semibold cursor-pointer"
                        >
                          <Badge
                            variant="outline"
                            className={CATEGORY_COLORS[category] ?? ""}
                          >
                            {category.replace("_", " ")}
                          </Badge>
                        </label>
                      </div>
                      <div className="space-y-1.5 ml-4">
                        {roles.map((role) => (
                          <div key={role.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`role-${role.id}`}
                              checked={!hiddenRoles.has(role.id)}
                              onCheckedChange={() => toggleRole(role.id)}
                            />
                            <label
                              htmlFor={`role-${role.id}`}
                              className="text-xs cursor-pointer"
                            >
                              {role.displayName}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        <TabsContent value="week" className="mt-4">
          {renderWeekView()}
        </TabsContent>
        <TabsContent value="month" className="mt-4">
          {renderMonthView()}
        </TabsContent>
      </Tabs>

      {/* Day detail sheet */}
      {renderDaySheet()}

      {/* Override dialog */}
      {renderOverrideDialog()}
    </div>
  );
}
