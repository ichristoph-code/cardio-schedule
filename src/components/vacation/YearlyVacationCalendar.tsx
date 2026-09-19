"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DayStateEditor } from "@/components/vacation/DayStateEditor";
import { DaySelectionBar } from "@/components/vacation/DaySelectionBar";
import type { DayState } from "@/components/vacation/day-types";
import { datesBetween } from "@/lib/calendar-dates";
import { getAllHolidayDatesForYear, getFederalHolidayDatesForYear, type CustomHolidayInfo } from "@/lib/holidays";
import { buildVacationStateMap, computeYearTallies, type VacationDayState } from "@/lib/year-tallies";
import { DAY_COLORS } from "@/lib/colors";
import {
  DAY_CELL, DAY_GRID, DAY_IDLE, DAY_LABEL, DAY_LABELS, DAY_TODAY, LEGEND_ROW,
  MONTH_CARD, MONTH_NAMES, MONTH_TITLE, YEAR_GRID, dateKey, monthCells,
} from "@/components/calendar/year-grid";
import { LegendItem } from "@/components/calendar/LegendItem";

/** Breathing room between the bulk bar and the days it must not cover. */
const BAR_CLEARANCE = 24;

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
  callDays?: { date: string; manual: boolean }[];
  noCallDays?: string[];
  customHolidays?: CustomHolidayInfo[];
  isAdmin?: boolean;
  physicianId?: string;
  physicianName?: string;
}


function MonthGrid({
  year,
  month,
  vacMap,
  floatSet,
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
  vacMap: Map<string, VacationDayState>;
  floatSet: Set<string>;
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
  const cells = monthCells(year, month);

  return (
    <div className={MONTH_CARD}>
      <h3 className={MONTH_TITLE}>{MONTH_NAMES[month]}</h3>
      <div className={DAY_GRID}>
        {DAY_LABELS.map((d) => (
          <div key={d} className={DAY_LABEL}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = dateKey(year, month, day);
          const vac = vacMap.get(dateStr);
          const call = callMap.get(dateStr); // undefined | true (manual) | false (auto)
          const isCall = call !== undefined;
          const isFloat = floatSet.has(dateStr);
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
            DAY_CELL,
            isAdmin ? (isSelected ? "cursor-pointer" : "cursor-pointer hover:ring-2 hover:ring-primary/40") : "",
            (vac === "VACATION"
              ? DAY_COLORS.vacation.cell
              : vac === "HALF_AM" || vac === "HALF_PM"
                ? DAY_COLORS.halfDay.cell
                : isCall
                  ? DAY_COLORS.call.cell
                  : isFloat
                    ? DAY_COLORS.float.cell
                    : isNoCall
                      ? DAY_COLORS.noCall.cell
                      : holidayName
                        ? DAY_COLORS.holiday.cell
                        : isToday
                          ? DAY_TODAY
                          : DAY_IDLE) + callRing + selectionRing,
          ].join(" ");

          const title =
            vac === "HALF_AM" ? "Half day (AM)"
            : vac === "HALF_PM" ? "Half day (PM)"
            : vac === "VACATION" ? "Vacation day"
            : isCall ? (call ? "General Call (manually set)" : "General Call (system-assigned)")
            : isFloat ? "Hospital Float"
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
  callDays = [],
  noCallDays = [],
  customHolidays = [],
  isAdmin = false,
  physicianId,
  physicianName,
}: Props) {
  const vacMap = buildVacationStateMap(vacations);
  const floatSet = new Set(floatDays);
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
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!cell) return;
    // Kept (not cleared) so a later, taller measurement scrolls again. Repeats
    // are free: `block: "nearest"` does nothing once the day is already clear.
    cell.style.scrollMarginBottom = `${barHeight + BAR_CLEARANCE}px`;
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
  const tallies = computeYearTallies(year, vacMap, holidays, new Set(callMap.keys()));

  // Current type of the day being edited (for highlighting in the editor).
  const selectedState: DayState = selectedDate
    ? (vacMap.get(selectedDate)
        ?? (callMap.has(selectedDate)
          ? "CALL"
          : floatSet.has(selectedDate)
            ? "FLOAT"
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
      <div className={LEGEND_ROW}>
        <LegendItem swatch={DAY_COLORS.vacation.swatch}>Full day — <strong>{tallies.fullDays}</strong></LegendItem>
        <LegendItem swatch={DAY_COLORS.halfDay.swatch}>Half day — <strong>{tallies.halfDays}</strong></LegendItem>
        <LegendItem>Vacation days: <strong>{tallies.vacationDays}</strong></LegendItem>
        <LegendItem swatch={DAY_COLORS.holiday.swatch}>Holidays — <strong>{tallies.holidays}</strong></LegendItem>
        <LegendItem>Weekdays worked: <strong>{tallies.weekdaysWorked}</strong></LegendItem>
        {floatDays.length > 0 && (
          <LegendItem swatch={DAY_COLORS.float.swatch}>Hospital Float — <strong>{floatDays.length}</strong></LegendItem>
        )}
        <LegendItem swatch={DAY_COLORS.call.swatch}>General Call — <strong>{tallies.weekdayCallDays}</strong> weekday ·{" "}
            <strong>{tallies.weekendCallDays}</strong> weekend</LegendItem>
        {callDays.some((c) => c.manual) && (
          <LegendItem swatch={`ring-2 ring-inset ring-amber-400 ${DAY_COLORS.call.swatch}`}>Call — manually set</LegendItem>
        )}
        {noCallDays.length > 0 && (
          <LegendItem swatch={DAY_COLORS.noCall.swatch}>No-call — <strong>{noCallDays.length}</strong></LegendItem>
        )}
      </div>

      {isAdmin && (
        <div className="-mt-1 space-y-1 text-xs text-muted-foreground">
          <p>
            Click any day to set vacation, ½ day, float, general call, or no-call — or mark it as a holiday for everyone.
          </p>
          <p>
            To fill many days at once: <strong>drag</strong> across a run of days,{" "}
            <strong>shift-click</strong> to extend to a day, or{" "}
            <strong>⌘/Ctrl-click</strong> to pick scattered days — then choose a
            type from the bar at the bottom. <kbd className="rounded border px-1">Esc</kbd> deselects.
          </p>
        </div>
      )}

      <div ref={gridRef} className={YEAR_GRID}>
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            vacMap={vacMap}
            floatSet={floatSet}
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
      {barHeight > 0 && <div aria-hidden="true" style={{ height: barHeight + BAR_CLEARANCE }} />}

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
