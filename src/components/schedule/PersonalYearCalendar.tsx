"use client";

import { useMemo } from "react";
import { formatLocalDate, getAllHolidayDatesForYear, type CustomHolidayInfo } from "@/lib/holidays";
import { buildVacationStateMap, computeYearTallies, type VacationRange } from "@/lib/year-tallies";
import { DAY_COLORS } from "@/lib/colors";
import {
  DAY_CELL, DAY_GRID, DAY_IDLE, DAY_LABEL, DAY_LABELS, DAY_TODAY, LEGEND_ROW,
  MONTH_CARD, MONTH_NAMES, MONTH_TITLE, YEAR_GRID, dateKey, monthCells,
} from "@/components/calendar/year-grid";
import { LegendItem } from "@/components/calendar/LegendItem";

export interface PersonalAssignment {
  date: string; // YYYY-MM-DD
  roleName: string;
  roleDisplayName: string;
  roleCategory: string;
}

interface Props {
  year: number;
  assignments: PersonalAssignment[];
  vacations: VacationRange[];
  noCallDays: string[];
  customHolidays?: CustomHolidayInfo[];
}

/**
 * What a day of any other duty says under its number. The cell is about
 * 19px wide on a phone, so these are shorter than the Monthly view's labels.
 * A role not listed here falls back to its initials.
 */
const CELL_CODES: Record<string, string> = {
  DOC_IN_BOX: "DITB",
  ECHO_READER: "Echo",
  MPI_READER: "MPI",
  CARDIOVERSION_TEE: "CV",
};

/** Roles with a colour of their own; any other duty is orange. */
const ROLE_COLORS: Record<string, { cell: string; swatch: string }> = {
  DOC_IN_BOX: DAY_COLORS.docInBox,
  ECHO_READER: DAY_COLORS.echoReader,
  MPI_READER: DAY_COLORS.mpiReader,
};

function roleColor(a: PersonalAssignment) {
  return ROLE_COLORS[a.roleName] ?? DAY_COLORS.otherDuty;
}

function cellCode(a: PersonalAssignment): string {
  return CELL_CODES[a.roleName]
    ?? a.roleDisplayName.split(/\s+/).map((w) => w[0]).join("").toUpperCase();
}

/**
 * A physician's own year, drawn exactly like the Physician Calendar (the
 * physician's My Vacation & Work Calendar): same grid, same palette, same legend row. Where that calendar
 * shows the day types an admin sets, this one shows the roles the schedule
 * assigned. A day takes the colour of its most significant duty; the tooltip
 * carries the full detail.
 */
export function PersonalYearCalendar({ year, assignments, vacations, noCallDays, customHolidays = [] }: Props) {
  const vacMap = useMemo(() => buildVacationStateMap(vacations), [vacations]);
  const holidays = useMemo(() => getAllHolidayDatesForYear(year, customHolidays), [year, customHolidays]);
  const noCallSet = useMemo(() => new Set(noCallDays), [noCallDays]);

  const byDate = useMemo(() => {
    const m = new Map<string, PersonalAssignment[]>();
    for (const a of assignments) {
      const list = m.get(a.date) ?? [];
      list.push(a);
      m.set(a.date, list);
    }
    return m;
  }, [assignments]);

  const callDates = useMemo(
    () => new Set(assignments.filter((a) => a.roleCategory === "ON_CALL").map((a) => a.date)),
    [assignments],
  );
  const tallies = useMemo(
    () => computeYearTallies(year, vacMap, holidays, callDates),
    [year, vacMap, holidays, callDates],
  );

  // Legend counts follow the same precedence the cells use, so the numbers
  // describe what is actually drawn.
  const counts = useMemo(() => {
    let float = 0, rounder = 0;
    // Every other duty, per role: roleName -> legend label, swatch and number of days.
    const other = new Map<string, { label: string; swatch: string; days: number }>();
    for (const [date, duties] of byDate) {
      if (vacMap.has(date) || callDates.has(date)) continue;
      if (duties.some((a) => a.roleName === "HOSPITAL_FLOAT")) float += 1;
      else if (duties.some((a) => a.roleName === "ICU_ROUNDER")) rounder += 1;
      else {
        for (const a of duties) {
          const entry = other.get(a.roleName) ?? { label: `${a.roleDisplayName} (${cellCode(a)})`, swatch: roleColor(a).swatch, days: 0 };
          entry.days += 1;
          other.set(a.roleName, entry);
        }
      }
    }
    return { float, rounder, other: [...other.values()] };
  }, [byDate, vacMap, callDates]);

  const today = formatLocalDate(new Date());

  return (
    <div className="space-y-4">
      <div className={LEGEND_ROW}>
        <LegendItem>Workdays — <strong>{tallies.weekdaysWorked}</strong></LegendItem>
        <LegendItem swatch={DAY_COLORS.vacation.swatch}>Vacation — <strong>{tallies.vacationDays}</strong></LegendItem>
        {tallies.halfDays > 0 && (
          <LegendItem swatch={DAY_COLORS.halfDay.swatch}>Half-day vacation — <strong>{tallies.halfDays}</strong></LegendItem>
        )}
        <LegendItem swatch={DAY_COLORS.holiday.swatch}>Holidays — <strong>{tallies.holidays}</strong></LegendItem>
        {counts.float > 0 && (
          <LegendItem swatch={DAY_COLORS.float.swatch}>Hospital Float — <strong>{counts.float}</strong></LegendItem>
        )}
        {counts.rounder > 0 && (
          <LegendItem swatch={DAY_COLORS.rounder.swatch}>ICU Rounder — <strong>{counts.rounder}</strong></LegendItem>
        )}
        {counts.other.map((o) => (
          <LegendItem key={o.label} swatch={o.swatch}>{o.label} — <strong>{o.days}</strong></LegendItem>
        ))}
        {callDates.size > 0 && (
          <LegendItem swatch={DAY_COLORS.call.swatch}>
            On call — <strong>{tallies.weekdayCallDays}</strong> weekday ·{" "}
            <strong>{tallies.weekendCallDays}</strong> weekend
          </LegendItem>
        )}
        {noCallDays.length > 0 && (
          <LegendItem swatch={DAY_COLORS.noCall.swatch}>No-call — <strong>{noCallDays.length}</strong></LegendItem>
        )}
      </div>

      <div className={YEAR_GRID}>
        {Array.from({ length: 12 }, (_, month) => (
          <div key={month} className={MONTH_CARD}>
            <h3 className={MONTH_TITLE}>{MONTH_NAMES[month]}</h3>
            <div className={DAY_GRID}>
              {DAY_LABELS.map((d) => (
                <div key={d} className={DAY_LABEL}>{d}</div>
              ))}
              {monthCells(year, month).map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = dateKey(year, month, day);
                const vac = vacMap.get(dateStr);
                const duties = byDate.get(dateStr) ?? [];
                const holidayName = holidays.get(dateStr);
                const names = duties.map((a) => a.roleDisplayName).join(", ");

                // Same precedence as the vacation calendar: a vacation day reads
                // as vacation even on a holiday; a duty reads as that duty.
                let colour: string;
                let title: string | undefined;
                let codes: string[] = [];
                if (vac === "VACATION") {
                  colour = DAY_COLORS.vacation.cell; title = "Vacation";
                } else if (vac) {
                  colour = DAY_COLORS.halfDay.cell; title = vac === "HALF_AM" ? "Half day (AM)" : "Half day (PM)";
                } else if (callDates.has(dateStr)) {
                  colour = DAY_COLORS.call.cell; title = names;
                } else if (duties.some((a) => a.roleName === "HOSPITAL_FLOAT")) {
                  colour = DAY_COLORS.float.cell; title = names;
                } else if (duties.some((a) => a.roleName === "ICU_ROUNDER")) {
                  colour = DAY_COLORS.rounder.cell; title = names;
                } else if (duties.length > 0) {
                  // Two duties on one day: the first (by sort order) gives the colour.
                  colour = roleColor(duties[0]).cell; title = names;
                  codes = duties.map(cellCode);
                } else if (noCallSet.has(dateStr)) {
                  colour = DAY_COLORS.noCall.cell; title = "No-call day";
                } else if (holidayName) {
                  colour = DAY_COLORS.holiday.cell; title = holidayName;
                } else if (dateStr === today) {
                  colour = DAY_TODAY;
                } else {
                  colour = DAY_IDLE;
                }
                if (holidayName && colour !== DAY_COLORS.holiday.cell) {
                  title = title ? `${title} · ${holidayName}` : holidayName;
                }

                const content = vac === "HALF_AM" || vac === "HALF_PM"
                  ? <>{day}<span className="text-[8px] align-super ml-px">{vac === "HALF_AM" ? "AM" : "PM"}</span></>
                  : day;

                return (
                  <div key={i} title={title} className={`${DAY_CELL} ${colour}`}>
                    {content}
                    {codes.map((c) => (
                      <span key={c} className="block text-[7px] font-normal mt-px">{c}</span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
