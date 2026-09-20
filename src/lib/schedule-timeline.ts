import { z } from "zod";
import { addDays, isoToUtc } from "@/lib/calendar-dates";
import type { CustomHolidayInfo } from "@/lib/holidays";

export interface TimelineAssignment {
  id: string;
  scheduleId: string;
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

export interface TimelineData {
  assignments: TimelineAssignment[];
  schedules: { id: string; year: number; status: string }[];
  customHolidays: CustomHolidayInfo[];
}

export const TIMELINE_DAYS = 121;
export const TIMELINE_BUFFER = 42;
export const TIMELINE_DAY_WIDTH = 112;
export const TIMELINE_ROLE_WIDTH = 148;

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = isoToUtc(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const timelineRangeSchema = z.object({
  start: z.string().refine(isCalendarDate, "Invalid start date"),
  end: z.string().refine(isCalendarDate, "Invalid end date"),
}).refine(({ start, end }) => end >= start, "End must follow start")
  .refine(({ start, end }) => !isCalendarDate(start) || end <= addDays(start, 185), "Request at most 186 days");

/** Pixel offsets use calendar days in UTC, including across daylight saving. */
export function timelineDayOffset(start: string, date: string): number {
  return Math.round((isoToUtc(date).getTime() - isoToUtc(start).getTime()) / 86_400_000);
}
