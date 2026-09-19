// The look of a year-at-a-glance calendar: twelve month cards of small day
// chips, with a legend row above. Shared by the Physician Calendar
// (My Vacation & Work Calendar) and the Personal Task Calendar so the two cannot drift apart — a
// physician moving between them should see the same grid, not a cousin of it.

export const YEAR_GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4";
export const MONTH_CARD = "bg-white dark:bg-card rounded-xl border p-4 shadow-sm";
export const MONTH_TITLE = "text-sm font-semibold text-center mb-3 text-foreground";
export const DAY_GRID = "grid grid-cols-7 gap-px";
export const DAY_LABEL = "text-[10px] text-center text-muted-foreground font-medium pb-1";
/** Every day chip starts from this; a colour from DAY_COLORS is added on top. */
export const DAY_CELL = "text-[11px] text-center rounded py-[3px] leading-none select-none";
export const DAY_TODAY = "bg-primary/15 text-primary font-bold";
export const DAY_IDLE = "text-foreground hover:bg-muted/50";
export const LEGEND_ROW = "flex items-center gap-6 text-sm flex-wrap";
export const SWATCH = "inline-block w-3 h-3 rounded-sm";

export const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The cells of one month's 7-column grid: nulls to pad before the 1st, then
 * 1..N, then nulls to complete the last row.
 */
export function monthCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** "YYYY-MM-DD" for a day of a month, without going through a Date. */
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
