"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Palmtree,
  MoonStar,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

// --- Types ---

interface ExistingVacation {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
}

interface ExistingNoCallDay {
  id: string;
  date: string;
  reason: string | null;
  status: string;
}

type SelectionType = "vacation" | "nocall";

// --- Helpers ---

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns 0=Sun … 6=Sat for the first day of the month */
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

function dateInRange(dateStr: string, startDate: string, endDate: string): boolean {
  return dateStr >= startDate && dateStr <= endDate;
}

// --- Component ---

export function AnnualPreferencesView({
  physicianId,
  initialYear,
  existingVacations,
  existingNoCallDays,
}: {
  physicianId: string;
  initialYear: number;
  existingVacations: ExistingVacation[];
  existingNoCallDays: ExistingNoCallDay[];
}) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [submitting, setSubmitting] = useState(false);

  // New selections (not yet saved)
  const [newVacationDates, setNewVacationDates] = useState<Set<string>>(new Set());
  const [newNoCallDates, setNewNoCallDates] = useState<Set<string>>(new Set());

  // Shift-click range selection for vacations
  const [rangeStart, setRangeStart] = useState<string | null>(null);

  // Popover state
  const [popoverDate, setPopoverDate] = useState<string | null>(null);

  // Build lookup sets for existing data
  const existingVacationDates = useMemo(() => {
    const approved = new Set<string>();
    const pending = new Set<string>();
    for (const v of existingVacations) {
      const set = v.status === "APPROVED" ? approved : pending;
      const start = new Date(v.startDate + "T12:00:00");
      const end = new Date(v.endDate + "T12:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        set.add(ds);
      }
    }
    return { approved, pending };
  }, [existingVacations]);

  const existingNoCallDateSets = useMemo(() => {
    const approved = new Set<string>();
    const pending = new Set<string>();
    for (const nc of existingNoCallDays) {
      (nc.status === "APPROVED" ? approved : pending).add(nc.date);
    }
    return { approved, pending };
  }, [existingNoCallDays]);

  // Lookup: date → vacation request info (for cancellation / day removal)
  const vacationDateToRequest = useMemo(() => {
    const map = new Map<string, { id: string; status: string; startDate: string; endDate: string; isMultiDay: boolean }>();
    for (const v of existingVacations) {
      const isMultiDay = v.startDate !== v.endDate;
      const start = new Date(v.startDate + "T12:00:00");
      const end = new Date(v.endDate + "T12:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        map.set(ds, { id: v.id, status: v.status, startDate: v.startDate, endDate: v.endDate, isMultiDay });
      }
    }
    return map;
  }, [existingVacations]);

  // Lookup: date → no-call request ID (for cancellation)
  const noCallDateToRequest = useMemo(() => {
    const map = new Map<string, { id: string; status: string }>();
    for (const nc of existingNoCallDays) {
      map.set(nc.date, { id: nc.id, status: nc.status });
    }
    return map;
  }, [existingNoCallDays]);

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{
    date: string;
    type: "vacation" | "nocall";
    requestId: string;
    status: string;
    isMultiDay?: boolean;
    startDate?: string;
    endDate?: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancelEntireRequest() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const endpoint =
        cancelTarget.type === "vacation"
          ? `/api/vacation-requests/${cancelTarget.requestId}`
          : `/api/no-call-day-requests/${cancelTarget.requestId}`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to cancel request");
      }

      const label = cancelTarget.type === "vacation" ? "Vacation" : "No-call day";
      toast.success(`${label} request cancelled`);
      setCancelDialogOpen(false);
      setCancelTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRemoveSingleDay() {
    if (!cancelTarget || cancelTarget.type !== "vacation") return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/vacation-requests/${cancelTarget.requestId}/remove-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: cancelTarget.date }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to remove day");
      }

      toast.success(`Removed ${cancelTarget.date} from vacation`);
      setCancelDialogOpen(false);
      setCancelTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setCancelling(false);
    }
  }

  // Summary counts
  const summary = useMemo(() => {
    return {
      approvedVacations: existingVacationDates.approved.size,
      pendingVacations: existingVacationDates.pending.size,
      newVacations: newVacationDates.size,
      approvedNoCall: existingNoCallDateSets.approved.size,
      pendingNoCall: existingNoCallDateSets.pending.size,
      newNoCall: newNoCallDates.size,
    };
  }, [existingVacationDates, existingNoCallDateSets, newVacationDates, newNoCallDates]);

  const hasNewSelections = newVacationDates.size > 0 || newNoCallDates.size > 0;

  // Determine the status of a date cell
  const getDateStatus = useCallback(
    (dateStr: string) => {
      if (existingVacationDates.approved.has(dateStr)) return "vacation-approved";
      if (existingVacationDates.pending.has(dateStr)) return "vacation-pending";
      if (existingNoCallDateSets.approved.has(dateStr)) return "nocall-approved";
      if (existingNoCallDateSets.pending.has(dateStr)) return "nocall-pending";
      if (newVacationDates.has(dateStr)) return "vacation-new";
      if (newNoCallDates.has(dateStr)) return "nocall-new";
      return "available";
    },
    [existingVacationDates, existingNoCallDateSets, newVacationDates, newNoCallDates]
  );

  // Handle day click
  function handleDayClick(dateStr: string, shiftKey: boolean) {
    const status = getDateStatus(dateStr);

    // Existing dates — open cancel dialog
    if (status === "vacation-approved" || status === "vacation-pending") {
      const req = vacationDateToRequest.get(dateStr);
      if (req) {
        setCancelTarget({
          date: dateStr,
          type: "vacation",
          requestId: req.id,
          status: req.status,
          isMultiDay: req.isMultiDay,
          startDate: req.startDate,
          endDate: req.endDate,
        });
        setCancelDialogOpen(true);
      }
      return;
    }
    if (status === "nocall-approved" || status === "nocall-pending") {
      const req = noCallDateToRequest.get(dateStr);
      if (req) {
        setCancelTarget({ date: dateStr, type: "nocall", requestId: req.id, status: req.status });
        setCancelDialogOpen(true);
      }
      return;
    }

    // Toggle off new selections
    if (status === "vacation-new") {
      setNewVacationDates((prev) => {
        const next = new Set(prev);
        next.delete(dateStr);
        return next;
      });
      return;
    }
    if (status === "nocall-new") {
      setNewNoCallDates((prev) => {
        const next = new Set(prev);
        next.delete(dateStr);
        return next;
      });
      return;
    }

    // Shift-click for vacation range selection
    if (shiftKey && rangeStart) {
      const start = rangeStart < dateStr ? rangeStart : dateStr;
      const end = rangeStart < dateStr ? dateStr : rangeStart;
      setNewVacationDates((prev) => {
        const next = new Set(prev);
        const d = new Date(start + "T12:00:00");
        const endDate = new Date(end + "T12:00:00");
        while (d <= endDate) {
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (getDateStatus(ds) === "available") {
            next.add(ds);
          }
          d.setDate(d.getDate() + 1);
        }
        return next;
      });
      setRangeStart(null);
      return;
    }

    // Open popover to choose type
    setPopoverDate(dateStr);
  }

  function selectType(type: SelectionType) {
    if (!popoverDate) return;
    if (type === "vacation") {
      setNewVacationDates((prev) => new Set(prev).add(popoverDate));
      setRangeStart(popoverDate);
    } else {
      setNewNoCallDates((prev) => new Set(prev).add(popoverDate));
    }
    setPopoverDate(null);
  }

  // Convert new vacation dates to ranges
  function vacationDatesToRanges(dates: Set<string>): { startDate: string; endDate: string }[] {
    const sorted = [...dates].sort();
    if (sorted.length === 0) return [];
    const ranges: { startDate: string; endDate: string }[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(prev + "T12:00:00");
      const currDate = new Date(sorted[i] + "T12:00:00");
      const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        prev = sorted[i];
      } else {
        ranges.push({ startDate: start, endDate: prev });
        start = sorted[i];
        prev = sorted[i];
      }
    }
    ranges.push({ startDate: start, endDate: prev });
    return ranges;
  }

  async function handleSave() {
    if (!hasNewSelections) return;
    setSubmitting(true);
    try {
      const vacationRanges = vacationDatesToRanges(newVacationDates);
      const noCallDatesArray = [...newNoCallDates].sort();

      const res = await fetch("/api/annual-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          newVacations: vacationRanges,
          newNoCallDays: noCallDatesArray,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save preferences");
      }

      const result = await res.json();
      const parts = [];
      if (result.vacationsCreated > 0) parts.push(`${result.vacationsCreated} vacation request(s)`);
      if (result.noCallDaysCreated > 0) parts.push(`${result.noCallDaysCreated} no-call day(s)`);
      toast.success(`Submitted ${parts.join(" and ")} for approval`);

      setNewVacationDates(new Set());
      setNewNoCallDates(new Set());
      setRangeStart(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  function clearSelections() {
    setNewVacationDates(new Set());
    setNewNoCallDates(new Set());
    setRangeStart(null);
  }

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Year selector + summary */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear((y) => y - 1)}
            disabled={year <= 2024}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold tabular-nums">{year}</h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= 2100}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          {hasNewSelections && (
            <>
              <Button variant="outline" size="sm" onClick={clearSelections}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button size="sm" onClick={handleSave} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Preferences
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Approved Vacation ({summary.approvedVacations})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-200 border border-green-400" />
              <span>Pending Vacation ({summary.pendingVacations})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2 border-green-500 bg-white" />
              <span>New Vacation ({summary.newVacations})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span>Approved No-Call ({summary.approvedNoCall})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-200 border border-amber-400" />
              <span>Pending No-Call ({summary.pendingNoCall})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2 border-amber-500 bg-white" />
              <span>New No-Call ({summary.newNoCall})</span>
            </div>
          </div>
          {rangeStart && (
            <div className="mt-2 text-xs text-muted-foreground">
              Shift-click another date to select a vacation range starting from{" "}
              {rangeStart}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 12-month calendar grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 12 }, (_, month) => (
          <MonthCalendar
            key={month}
            year={year}
            month={month}
            getDateStatus={getDateStatus}
            onDayClick={handleDayClick}
            popoverDate={popoverDate}
            onSelectType={selectType}
            onClosePopover={() => setPopoverDate(null)}
          />
        ))}
      </div>

      {/* Cancel request confirmation dialog */}
      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) setCancelTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel {cancelTarget?.type === "vacation" ? "Vacation" : "No-Call Day"} Request
            </DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  Your{" "}
                  <strong>
                    {cancelTarget.status === "APPROVED" ? "approved" : "pending"}
                  </strong>{" "}
                  {cancelTarget.type === "vacation" ? "vacation" : "no-call day"}{" "}
                  {cancelTarget.isMultiDay ? (
                    <>
                      runs from <strong>{cancelTarget.startDate}</strong> to{" "}
                      <strong>{cancelTarget.endDate}</strong>. You clicked on{" "}
                      <strong>{cancelTarget.date}</strong>.
                    </>
                  ) : (
                    <>
                      is on <strong>{cancelTarget.date}</strong>.
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {cancelTarget?.isMultiDay && cancelTarget.type === "vacation" ? (
            <div className="space-y-2 pt-2">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={handleRemoveSingleDay}
                disabled={cancelling}
              >
                <div className="text-left">
                  <div className="font-medium">
                    {cancelling ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      "Remove just this day"
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Cancel only <strong>{cancelTarget.date}</strong> and keep the rest of the vacation
                  </div>
                </div>
              </Button>
              <Button
                variant="destructive"
                className="w-full justify-start h-auto py-3"
                onClick={handleCancelEntireRequest}
                disabled={cancelling}
              >
                <div className="text-left">
                  <div className="font-medium">
                    {cancelling ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      "Cancel entire vacation"
                    )}
                  </div>
                  <div className="text-xs text-destructive-foreground/80 mt-0.5">
                    Cancel the full {cancelTarget.startDate} – {cancelTarget.endDate} request
                  </div>
                </div>
              </Button>
              <DialogFooter className="pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setCancelDialogOpen(false)}
                >
                  Never mind
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(false)}
              >
                Keep It
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelEntireRequest}
                disabled={cancelling}
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Request"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Month Calendar Component ---

function MonthCalendar({
  year,
  month,
  getDateStatus,
  onDayClick,
  popoverDate,
  onSelectType,
  onClosePopover,
}: {
  year: number;
  month: number;
  getDateStatus: (dateStr: string) => string;
  onDayClick: (dateStr: string, shiftKey: boolean) => void;
  popoverDate: string | null;
  onSelectType: (type: SelectionType) => void;
  onClosePopover: () => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!popoverDate) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClosePopover();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverDate, onClosePopover]);

  const cells: (number | null)[] = [];
  // Fill empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold">
          {MONTH_NAMES[month]} {year}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-medium text-muted-foreground py-0.5"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }

            const dateStr = formatDate(year, month, day);
            const weekend = isWeekend(year, month, day);
            const status = getDateStatus(dateStr);

            const cellClasses = getCellClasses(status, weekend);
            const showDropdown = popoverDate === dateStr;

            return (
              <div key={dateStr} className="relative">
                <button
                  className={`aspect-square w-full flex items-center justify-center text-xs rounded-md transition-colors cursor-pointer
                    ${cellClasses}
                    hover:ring-2 hover:ring-primary/40
                  `}
                  onClick={(e) => {
                    onDayClick(dateStr, e.shiftKey);
                  }}
                  title={getTooltip(status, dateStr)}
                >
                  {day}
                </button>
                {showDropdown && (
                  <div
                    ref={popoverRef}
                    className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white rounded-lg shadow-lg border p-1.5 flex gap-1 whitespace-nowrap"
                  >
                    <button
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-green-50 hover:border-green-300 transition-colors"
                      onClick={() => onSelectType("vacation")}
                    >
                      <Palmtree className="h-3 w-3" />
                      Vacation
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-amber-50 hover:border-amber-300 transition-colors"
                      onClick={() => onSelectType("nocall")}
                    >
                      <MoonStar className="h-3 w-3" />
                      No Call
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Styling Helpers ---

function getCellClasses(status: string, weekend: boolean): string {
  switch (status) {
    case "vacation-approved":
      return "bg-green-500 text-white font-semibold";
    case "vacation-pending":
      return "bg-green-200 text-green-800 border border-green-400";
    case "vacation-new":
      return "bg-white border-2 border-green-500 text-green-700 font-semibold";
    case "nocall-approved":
      return "bg-amber-500 text-white font-semibold";
    case "nocall-pending":
      return "bg-amber-200 text-amber-800 border border-amber-400";
    case "nocall-new":
      return "bg-white border-2 border-amber-500 text-amber-700 font-semibold";
    default:
      return weekend ? "bg-gray-100 text-gray-600" : "bg-white text-gray-900";
  }
}

function getTooltip(status: string, dateStr: string): string {
  switch (status) {
    case "vacation-approved":
      return `${dateStr}: Approved vacation — click to cancel`;
    case "vacation-pending":
      return `${dateStr}: Vacation (pending) — click to cancel`;
    case "vacation-new":
      return `${dateStr}: New vacation (unsaved) — click to remove`;
    case "nocall-approved":
      return `${dateStr}: Approved no-call day — click to cancel`;
    case "nocall-pending":
      return `${dateStr}: No-call day (pending) — click to cancel`;
    case "nocall-new":
      return `${dateStr}: New no-call day (unsaved) — click to remove`;
    default:
      return `${dateStr}: Click to select`;
  }
}
