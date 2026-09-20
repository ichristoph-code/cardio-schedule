"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { addDays, eachDateInRange, isoToUtc } from "@/lib/calendar-dates";
import { formatLocalDate, getFederalHolidayDatesForYear } from "@/lib/holidays";
import { CATEGORY_COLORS, DAY_COLORS, PHYSICIAN_COLORS } from "@/lib/colors";
import {
  isCalendarDate, timelineDayOffset, TIMELINE_BUFFER, TIMELINE_DAYS,
  TIMELINE_DAY_WIDTH, TIMELINE_ROLE_WIDTH,
  type TimelineAssignment, type TimelineData,
} from "@/lib/schedule-timeline";

type Role = { id: string; displayName: string; category: string };
type LoadedRange = { start: string; end: string; data: TimelineData };
const dateLabel = (date: string) => isoToUtc(date).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

export function ScheduleTimeline({ initialDate, roles, physicianColors, refreshKey, onEdit, onDaySelect }: {
  initialDate: string;
  roles: Role[];
  physicianColors: Map<string, typeof PHYSICIAN_COLORS[number]>;
  refreshKey: number;
  onEdit: (assignment: TimelineAssignment) => void;
  onDaySelect: (date: string, assignments: TimelineAssignment[]) => void;
}) {
  const [windowStart, setWindowStart] = useState(() => addDays(initialDate, -TIMELINE_BUFFER));
  const windowEnd = addDays(windowStart, TIMELINE_DAYS - 1);
  const [visible, setVisible] = useState({ start: initialDate, end: addDays(initialDate, 6) });
  const [loaded, setLoaded] = useState<LoadedRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const previousStart = useRef<string | null>(null);
  const pendingJump = useRef<string | null>(initialDate);
  const rebasing = useRef(false);

  // Only a small date window stays mounted. Replacing dates off screen and
  // correcting the pixel offset preserves the date under the user's finger.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (pendingJump.current) {
      element.scrollLeft = timelineDayOffset(windowStart, pendingJump.current) * TIMELINE_DAY_WIDTH;
      pendingJump.current = null;
    } else if (previousStart.current) {
      element.scrollLeft += timelineDayOffset(windowStart, previousStart.current) * TIMELINE_DAY_WIDTH;
    }
    previousStart.current = windowStart;
    rebasing.current = false;

    function updateVisibleDates() {
      if (!element) return;
      const first = Math.floor(element.scrollLeft / TIMELINE_DAY_WIDTH);
      const last = Math.max(first, Math.ceil((element.scrollLeft + element.clientWidth - TIMELINE_ROLE_WIDTH) / TIMELINE_DAY_WIDTH) - 1);
      const start = addDays(windowStart, first);
      const end = addDays(windowStart, last);
      setVisible((old) => old.start === start && old.end === end ? old : { start, end });
    }
    updateVisibleDates();
    element.addEventListener("scroll", updateVisibleDates, { passive: true });
    const observer = new ResizeObserver(updateVisibleDates);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", updateVisibleDates); observer.disconnect(); };
  }, [windowStart]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const response = await fetch(`/api/schedules/timeline?start=${windowStart}&end=${windowEnd}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load these dates. Please retry.");
        const data: TimelineData = await response.json();
        if (!controller.signal.aborted) setLoaded({ start: windowStart, end: windowEnd, data });
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load these dates.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [windowStart, windowEnd, refreshKey, retry]);

  const dates = useMemo(() => eachDateInRange(windowStart, windowEnd), [windowStart, windowEnd]);
  const byDate = useMemo(() => {
    const map = new Map<string, TimelineAssignment[]>();
    for (const assignment of loaded?.data.assignments ?? []) {
      const day = map.get(assignment.date) ?? [];
      day.push(assignment);
      map.set(assignment.date, day);
    }
    return map;
  }, [loaded]);
  const schedules = new Map(loaded?.data.schedules.map((s) => [s.year, s]));
  const holidays = useMemo(() => {
    const map = new Map<string, string>();
    // Include next January's observance when it falls on December 31.
    for (let year = Number(windowStart.slice(0, 4)); year <= Number(windowEnd.slice(0, 4)) + 1; year++) {
      getFederalHolidayDatesForYear(year).forEach((name, date) => map.set(date, name));
    }
    for (const holiday of loaded?.data.customHolidays ?? []) {
      if (holiday.hidden) map.delete(holiday.date);
      else map.set(holiday.date, holiday.name);
    }
    return map;
  }, [windowStart, windowEnd, loaded]);

  function extendTimeline() {
    const element = scroller.current;
    if (!element || rebasing.current) return;
    const remaining = element.scrollWidth - element.clientWidth - element.scrollLeft;
    const shift = element.scrollLeft < 14 * TIMELINE_DAY_WIDTH ? -TIMELINE_BUFFER
      : remaining < 14 * TIMELINE_DAY_WIDTH ? TIMELINE_BUFFER : 0;
    if (shift) {
      rebasing.current = true;
      setWindowStart(addDays(windowStart, shift));
    }
  }

  function jumpTo(date: string) {
    if (!isCalendarDate(date)) return;
    const start = addDays(date, -TIMELINE_BUFFER);
    if (start === windowStart && scroller.current) {
      scroller.current.scrollLeft = TIMELINE_BUFFER * TIMELINE_DAY_WIDTH;
    } else {
      pendingJump.current = date;
      setWindowStart(start);
    }
  }

  function move(days: number) {
    scroller.current?.scrollBy({ left: days * TIMELINE_DAY_WIDTH, behavior: "instant" });
  }

  const today = formatLocalDate(new Date());
  return <section className="min-w-0 space-y-3" aria-label="Continuous group schedule">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Earlier dates" onClick={() => move(-7)}><ChevronLeft /></Button>
        <h3 className="text-sm sm:text-base font-semibold tabular-nums" aria-live="polite">{dateLabel(visible.start)} – {dateLabel(visible.end)}</h3>
        <Button variant="ghost" size="icon" aria-label="Later dates" onClick={() => move(7)}><ChevronRight /></Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => jumpTo(today)}>Today</Button>
        <label className="flex items-center gap-2 text-sm">Go to date
          <input type="date" aria-label="Go to date" value={visible.start} onChange={(event) => jumpTo(event.target.value)} className="rounded-md border bg-background px-2 py-1 min-w-0" />
        </label>
      </div>
    </div>
    <p id="timeline-help" className="text-xs text-muted-foreground">Swipe or scroll sideways to keep going in either direction. Dates continue across months and years.</p>
    {error && <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>Retry</Button></div>}
    <div ref={scroller} onScroll={extendTimeline} role="region" aria-label="Scrollable schedule" aria-describedby="timeline-help"
      tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border bg-background focus-visible:outline-2 focus-visible:outline-primary"
      style={{ overflowAnchor: "none" }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}>
      <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: TIMELINE_ROLE_WIDTH + TIMELINE_DAYS * TIMELINE_DAY_WIDTH }}>
        <caption className="sr-only">Group schedule by role and date. Scroll sideways for earlier or later dates.</caption>
        <colgroup><col style={{ width: TIMELINE_ROLE_WIDTH }} />{dates.map((date) => <col key={date} style={{ width: TIMELINE_DAY_WIDTH }} />)}</colgroup>
        <thead><tr>
          <th scope="col" className="sticky left-0 z-20 border-b border-r bg-muted p-3 text-left">Role</th>
          {dates.map((date) => {
            const day = isoToUtc(date);
            const holiday = holidays.get(date);
            const known = loaded && date >= loaded.start && date <= loaded.end;
            const schedule = schedules.get(day.getUTCFullYear());
            return <th key={date} scope="col" data-date={date} title={holiday} className={`border-b border-r px-1 py-2 text-center ${date === today ? "bg-primary/10" : holiday ? DAY_COLORS.holiday.tint : [0, 6].includes(day.getUTCDay()) ? "bg-slate-200/70 dark:bg-slate-800" : "bg-muted"}`}>
              <div className="text-[10px] text-muted-foreground">{day.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</div>
              <div>{day.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" })}</div>
              {holiday && <div className="text-[10px] leading-tight mt-1 font-normal">{holiday}</div>}
              {known && <div className="text-[10px] text-muted-foreground font-normal">{schedule ? schedule.status.charAt(0) + schedule.status.slice(1).toLowerCase() : "No schedule"}</div>}
            </th>;
          })}
        </tr></thead>
        <tbody>{roles.map((role) => <tr key={role.id}>
          <th scope="row" className="sticky left-0 z-10 border-b border-r bg-background p-2 text-left font-normal"><Badge variant="outline" className={`whitespace-normal ${CATEGORY_COLORS[role.category] ?? ""}`}>{role.displayName}</Badge></th>
          {dates.map((date) => {
            const known = loaded && date >= loaded.start && date <= loaded.end;
            const dayAssignments = byDate.get(date) ?? [];
            const assignment = dayAssignments.find((a) => a.roleTypeId === role.id);
            const color = assignment && physicianColors.get(assignment.physicianId);
            const weekend = [0, 6].includes(isoToUtc(date).getUTCDay());
            return <td key={date} className={`border-b border-r p-0 text-center ${date === today ? "bg-primary/5" : holidays.has(date) ? DAY_COLORS.holiday.tint : weekend ? "bg-slate-100 dark:bg-slate-800/30" : ""}`}>
              <button type="button" disabled={!known} className={`w-full min-h-12 px-1 py-2 text-xs hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait ${assignment?.source === "MANUAL" ? "ring-1 ring-inset ring-amber-400" : ""}`}
                aria-label={`${role.displayName}, ${date}: ${known ? assignment?.physicianName ?? "No assignment" : error ? "Unavailable" : "Loading"}`}
                onClick={() => assignment ? onEdit(assignment) : onDaySelect(date, dayAssignments)}>
                {assignment ? <span className={`inline-block max-w-full truncate rounded-md px-1.5 py-0.5 font-medium ${color?.bg ?? ""} ${color?.text ?? ""}`} title={assignment.physicianName}>{assignment.physicianLastName}</span>
                  : <span className="text-muted-foreground">{known ? "—" : error ? "Unavailable" : "Loading…"}</span>}
              </button>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    {roles.length === 0 && <p className="text-sm text-muted-foreground">All roles are hidden. Use Filter Roles to show them.</p>}
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span>Click an assignment to edit it.</span><span>Amber outline: manual override</span>
      <span role="status">{loading ? "Loading schedule…" : ""}</span>
    </div>
  </section>;
}
