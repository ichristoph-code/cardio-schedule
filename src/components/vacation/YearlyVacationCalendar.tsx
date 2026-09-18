"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DayStateEditor } from "@/components/vacation/DayStateEditor";
import { DaySelectionBar } from "@/components/vacation/DaySelectionBar";
import type { DayState } from "@/components/vacation/day-types";
import { datesBetween } from "@/lib/calendar-dates";
import { getAllHolidayDatesForYear, getFederalHolidayDatesForYear, type CustomHolidayInfo } from "@/lib/holidays";
import { computeYearTallies } from "@/lib/year-tallies";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

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
  customHolidays?: CustomHolidayInfo[];
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
  selected,
  onDayClick,
  onDayMouseDown,
  onDayMouseEnter,
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
  selected: Set<string>;
  onDayClick: (date: string) => void;
  onDayMouseDown: (date: string, e: React.MouseEvent) => void;
  onDayMouseEnter: (date: string) => void;
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
          const isSelected = selected.has(dateStr);

          // Manual call gets an amber ring so system- vs manually-set is visible
          // at a glance — but only when call is the displayed state (not when a
          // vacation/half overrides it).
          const callRing = !vac && call === true ? " ring-2 ring-inset ring-amber-400" : "";

          // Drawn outside the cell (not inset) and lifted above its
          // neighbours so a multi-day run reads as one continuous band.
          const selectionRing = isSelected
            ? " relative z-10 ring-2 ring-sky-600 dark:ring-sky-400"
            : "";

          const className = [
            "text-[11px] text-center rounded py-[3px] leading-none select-none",
            isAdmin ? (isSelected ? "cursor-pointer" : "cursor-pointer hover:ring-2 hover:ring-primary/40") : "",
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
                            : "text-foreground hover:bg-muted/50") + callRing + selectionRing,
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
              <button
                key={i}
                type="button"
                data-date={dateStr}
                title={title}
                aria-pressed={isSelected}
                className={className}
                onMouseDown={(e) => onDayMouseDown(dateStr, e)}
                onMouseEnter={() => onDayMouseEnter(dateStr)}
                onClick={() => onDayClick(dateStr)}
              >
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
  customHolidays = [],
  isAdmin = false,
  physicianId,
  physicianName,
}: Props) {
  const vacMap = buildVacationStateMap(vacations);
  const floatSet = new Set(floatDays);
  const rounderSet = new Set(rounderDays);
  const callMap = new Map(callDays.map((c) => [c.date, c.manual] as const));
  const noCallSet = new Set(noCallDays);
  // Built-in holidays + admin-marked custom holidays (global, all physicians).
  const holidays = getAllHolidayDatesForYear(year, customHolidays);
  const customHolidaySet = new Set(customHolidays.filter((h) => !h.hidden).map((h) => h.date));
  // Dates where an admin has suppressed a built-in holiday — keyed to the original name.
  const builtInHolidays = getFederalHolidayDatesForYear(year);
  const hiddenBuiltInMap = new Map(
    customHolidays.filter((h) => h.hidden).map((h) => [h.date, builtInHolidays.get(h.date) ?? h.name])
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ── Multi-day selection (drag / shift-click / cmd-click) ───────────────────
  // A plain click still opens the single-day editor; a selection only starts
  // once the pointer moves onto another cell or a modifier key is held.
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  // Where the next shift-click measures from — the last cell the admin acted on.
  const anchorRef = useRef<string | null>(null);
  // Live drag, if one is in progress. `moved` stays false for a plain click.
  const dragRef = useRef<{ start: string; moved: boolean; last?: string } | null>(null);
  // Set when a press was a selection gesture, so the click that follows it does
  // not also open the editor sheet.
  const suppressClickRef = useRef(false);
  // The bulk bar is fixed to the bottom of the viewport, so the page reserves
  // its measured height below the grid — otherwise December sits underneath it,
  // unreadable and unclickable.
  const [barHeight, setBarHeight] = useState(0);
  // True once a drag has actually moved: the bar goes click-through so the drag
  // can continue over the days it covers.
  const [dragging, setDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // The day to scroll clear of the bar once the bar has been measured.
  const revealRef = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    revealRef.current = null;
    setSelectedDays(new Set());
  }, []);

  // A drag can end anywhere — outside the grid, outside the window — so the
  // release is tracked globally rather than per cell.
  useEffect(() => {
    const onMouseUp = () => {
      const drag = dragRef.current;
      if (drag?.moved) {
        anchorRef.current = drag.start;
        revealRef.current = drag.last ?? drag.start;
      }
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection]);

  const handleDayMouseDown = useCallback(
    (date: string, e: React.MouseEvent) => {
      if (!isAdmin || e.button !== 0) return;
      const additive = e.metaKey || e.ctrlKey;

      // Shift-click: extend from the anchor to here.
      if (e.shiftKey && anchorRef.current) {
        suppressClickRef.current = true;
        revealRef.current = date;
        const span = datesBetween(anchorRef.current, date);
        setSelectedDays((prev) => (additive ? new Set([...prev, ...span]) : new Set(span)));
        return;
      }

      // Cmd/Ctrl-click: toggle this one day in or out.
      if (additive) {
        suppressClickRef.current = true;
        revealRef.current = date;
        setSelectedDays((prev) => {
          const next = new Set(prev);
          if (next.has(date)) next.delete(date);
          else next.add(date);
          return next;
        });
        anchorRef.current = date;
        return;
      }

      // Plain press: only becomes a selection if the pointer moves off this cell.
      dragRef.current = { start: date, moved: false, last: date };
      suppressClickRef.current = false;
    },
    [isAdmin],
  );

  const handleDayMouseEnter = useCallback((date: string) => {
    const drag = dragRef.current;
    if (!drag || date === drag.start) return;
    drag.moved = true;
    drag.last = date;
    suppressClickRef.current = true;
    setDragging(true);
    setSelectedDays(new Set(datesBetween(drag.start, date)));
  }, []);

  // Once the bar is up and measured, nudge the day that was just selected above
  // it. `block: "nearest"` means this is a no-op when the day is already clear.
  useEffect(() => {
    const date = revealRef.current;
    if (dragging || barHeight === 0 || !date) return;
    revealRef.current = null;
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!cell) return;
    cell.style.scrollMarginBottom = `${barHeight + 8}px`;
    cell.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [barHeight, dragging, selectedDays]);

  const handleDayClick = useCallback((date: string) => {
    // Swallow the click that ends a drag or follows a modifier-click.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // A plain click drops any selection and edits just this day, as in a spreadsheet.
    setSelectedDays(new Set());
    anchorRef.current = date;
    setSelectedDate(date);
  }, []);

  // Counted in weekdays, so a vacation spanning a weekend or landing on a
  // holiday doesn't inflate the total. See src/lib/year-tallies.ts.
  const tallies = computeYearTallies(year, vacMap, holidays);

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
          <span className="text-muted-foreground">Full day — <strong>{tallies.fullDays}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200" />
          <span className="text-muted-foreground">Half day — <strong>{tallies.halfDays}</strong></span>
        </div>
        <div className="text-muted-foreground">
          Vacation days: <strong>{tallies.vacationDays}</strong>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-300" />
          <span className="text-muted-foreground">Holidays — <strong>{tallies.holidays}</strong></span>
        </div>
        <div className="text-muted-foreground">
          Weekdays worked: <strong>{tallies.weekdaysWorked}</strong>
        </div>
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
      </div>

      {isAdmin && (
        <div className="-mt-1 space-y-1 text-xs text-muted-foreground">
          <p>
            Click any day to set vacation, ½ day, float, rounder, general call, or no-call — or mark it as a holiday for everyone.
          </p>
          <p>
            To fill many days at once: <strong>drag</strong> across a run of days,{" "}
            <strong>shift-click</strong> to extend to a day, or{" "}
            <strong>⌘/Ctrl-click</strong> to pick scattered days — then choose a
            type from the bar at the bottom. <kbd className="rounded border px-1">Esc</kbd> deselects.
          </p>
        </div>
      )}

      <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
            selected={selectedDays}
            onDayClick={handleDayClick}
            onDayMouseDown={handleDayMouseDown}
            onDayMouseEnter={handleDayMouseEnter}
          />
        ))}
      </div>

      {isAdmin && physicianId && selectedDays.size > 0 && (
        <DaySelectionBar
          physicianId={physicianId}
          physicianName={physicianName ?? ""}
          year={year}
          dates={[...selectedDays].sort()}
          onClear={clearSelection}
          onApplied={clearSelection}
          onHeightChange={setBarHeight}
          passthrough={dragging}
        />
      )}

      {/* Keeps the last row of months scrollable clear of the fixed bar. */}
      {barHeight > 0 && <div aria-hidden="true" style={{ height: barHeight }} />}

      {isAdmin && physicianId && selectedDate && (
        <DayStateEditor
          key={selectedDate}
          physicianId={physicianId}
          physicianName={physicianName ?? ""}
          year={year}
          date={selectedDate}
          current={selectedState}
          holidayName={holidays.get(selectedDate)}
          isCustomHoliday={customHolidaySet.has(selectedDate)}
          hiddenBuiltInName={hiddenBuiltInMap.get(selectedDate)}
          callSource={selectedCallSource}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
