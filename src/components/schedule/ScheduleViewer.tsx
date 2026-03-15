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
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Pencil,
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

// Physician color palette — visually distinct, readable colors
const PHYSICIAN_COLORS = [
  { bg: "bg-blue-100",    text: "text-blue-800",    dot: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-violet-100",  text: "text-violet-800",  dot: "bg-violet-500" },
  { bg: "bg-amber-100",   text: "text-amber-800",   dot: "bg-amber-500" },
  { bg: "bg-rose-100",    text: "text-rose-800",    dot: "bg-rose-500" },
  { bg: "bg-cyan-100",    text: "text-cyan-800",    dot: "bg-cyan-500" },
  { bg: "bg-orange-100",  text: "text-orange-800",  dot: "bg-orange-500" },
  { bg: "bg-indigo-100",  text: "text-indigo-800",  dot: "bg-indigo-500" },
  { bg: "bg-lime-100",    text: "text-lime-800",    dot: "bg-lime-500" },
  { bg: "bg-pink-100",    text: "text-pink-800",    dot: "bg-pink-500" },
  { bg: "bg-teal-100",    text: "text-teal-800",    dot: "bg-teal-500" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800", dot: "bg-fuchsia-500" },
  { bg: "bg-sky-100",     text: "text-sky-800",     dot: "bg-sky-500" },
  { bg: "bg-yellow-100",  text: "text-yellow-800",  dot: "bg-yellow-500" },
  { bg: "bg-red-100",     text: "text-red-800",     dot: "bg-red-500" },
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
            const dayAssignments = assignmentsByDate.get(dateStr) ?? [];
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
    const weekDates: string[] = [];
    const ws = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      weekDates.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }

    function prevWeek() {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - 7);
      if (d.getFullYear() >= schedule.year) setWeekStart(d);
    }
    function nextWeek() {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7);
      if (d.getFullYear() <= schedule.year) setWeekStart(d);
    }

    const weekLabel = (() => {
      const s = new Date(weekStart);
      const e = new Date(weekStart);
      e.setDate(e.getDate() + 6);
      return `${MONTH_NAMES[s.getMonth()].slice(0, 3)} ${s.getDate()} \u2013 ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
    })();

    return (
      <div>
        {/* Week navigation */}
        <div className="flex items-center justify-center gap-1 mb-4">
          <Button variant="ghost" size="sm" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold">{weekLabel}</h3>
          <Button variant="ghost" size="sm" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Grid table */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <table className="w-full border-collapse text-sm min-w-[700px]">
            <thead>
              <tr>
                <th className="border p-2 bg-muted text-left w-[140px]">Role</th>
                {weekDates.map((dateStr, i) => {
                  const d = new Date(dateStr + "T12:00:00");
                  const today = isToday(dateStr);
                  return (
                    <th
                      key={dateStr}
                      className={`border p-2 text-center ${
                        today ? "bg-primary/10 font-bold" : "bg-muted"
                      } ${i === 0 || i === 6 ? "bg-muted/60" : ""}`}
                    >
                      <div className="text-xs text-muted-foreground">
                        {DAY_LABELS[i]}
                      </div>
                      <div>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeRoleTypes.map((role) => (
                <tr key={role.id}>
                  <td className="border p-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_COLORS[role.category] ?? ""}`}
                    >
                      {role.displayName}
                    </Badge>
                  </td>
                  {weekDates.map((dateStr, dayIdx) => {
                    const dayAssigns = assignmentsByDate.get(dateStr) ?? [];
                    const assignment = dayAssigns.find(
                      (a) => a.roleTypeId === role.id
                    );
                    const today = isToday(dateStr);

                    const pColor = assignment ? physicianColors.get(assignment.physicianId) : undefined;

                    return (
                      <td
                        key={dateStr}
                        className={`border p-1 text-center text-xs cursor-pointer hover:bg-accent/50 transition-colors
                          ${today ? "bg-primary/5" : ""}
                          ${dayIdx === 0 || dayIdx === 6 ? "bg-muted/10" : ""}
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
        {isAdmin && schedule.status === "DRAFT" && (
          <Button onClick={handlePublish}>
            <Send className="mr-2 h-4 w-4" />
            Publish Schedule
          </Button>
        )}
      </div>

      {/* Stats */}
      {renderStats()}

      {/* Tabs: Month / Week */}
      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">Week View</TabsTrigger>
          <TabsTrigger value="month">Month View</TabsTrigger>
        </TabsList>
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
