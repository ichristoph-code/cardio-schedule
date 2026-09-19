// One colour per concept, used by every calendar.
//
// Before this file, each calendar chose its own: vacation was emerald on the
// year grid, amber on the monthly grid and green on the request calendar;
// holidays were yellow in one place and rose in another; the role-category
// chips were copied into four files and one copy had drifted. A physician
// moving between pages had to learn several colour languages for one set of
// facts. Now a concept has one hue, and each entry below is that hue at the
// intensity its context needs (a solid chip, a soft cell tint, a card, text).
//
// Every value is a complete class string on purpose. Tailwind finds classes by
// scanning source for literals; a class built at runtime ("bg-" + hue) would
// never be generated.

export const DAY_COLORS = {
  vacation: {
    /** Solid chip on the year grids. */
    cell: "bg-emerald-500 text-white font-semibold",
    /** Legend square. */
    swatch: "bg-emerald-500",
    /** Selected state of the editor / bulk-bar button. */
    active: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600",
    /** Cell background on the monthly grid. */
    soft: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-950/20",
    /** Detail card on the monthly view. */
    card: "border-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40",
    /** Flat tint for a stat box. */
    tint: "bg-emerald-50 dark:bg-emerald-950/30",
    icon: "text-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    textMuted: "text-emerald-600 dark:text-emerald-400",
  },
  halfDay: {
    cell: "bg-emerald-200 text-emerald-900 font-semibold",
    swatch: "bg-emerald-200",
    active: "bg-emerald-300 text-emerald-950 border-emerald-300 hover:bg-emerald-400",
  },
  float: {
    cell: "bg-blue-400 text-white font-semibold",
    swatch: "bg-blue-400",
    active: "bg-blue-500 text-white border-blue-500 hover:bg-blue-600",
    soft: "bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-950/20",
    icon: "text-blue-500",
    textMuted: "text-blue-600 dark:text-blue-400",
  },
  rounder: {
    cell: "bg-purple-400 text-white font-semibold",
    swatch: "bg-purple-400",
    active: "bg-purple-500 text-white border-purple-500 hover:bg-purple-600",
  },
  call: {
    cell: "bg-neutral-900 text-white font-semibold",
    swatch: "bg-neutral-900",
    active: "bg-neutral-900 text-white border-neutral-900 hover:bg-black",
  },
  noCall: {
    cell: "bg-slate-400 text-white font-semibold",
    swatch: "bg-slate-400",
    active: "bg-slate-500 text-white border-slate-500 hover:bg-slate-600",
    soft: "bg-slate-100/60 dark:bg-slate-900/30",
    card: "border-slate-300 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950/40 dark:to-gray-950/40",
    icon: "text-slate-500",
    text: "text-slate-700 dark:text-slate-300",
    textMuted: "text-slate-500",
  },
  hospitalRounder: {
    cell: "bg-rose-500 text-white font-semibold",
    swatch: "bg-rose-500",
  },
  docInBox: {
    cell: "bg-amber-700 text-white font-semibold",
    swatch: "bg-amber-700",
  },
  echoReader: {
    cell: "bg-cyan-500 text-white font-semibold",
    swatch: "bg-cyan-500",
  },
  mpiReader: {
    cell: "bg-indigo-600 text-white font-semibold",
    swatch: "bg-indigo-600",
  },
  /**
   * Any assignment on the Personal Task Calendar without a colour of its own
   * (cardioversion, a role added later). A short code under the day number
   * names the role, and the legend spells the code out.
   */
  otherDuty: {
    cell: "bg-orange-400 text-white font-semibold",
    swatch: "bg-orange-400",
  },
  holiday: {
    cell: "bg-yellow-300 text-yellow-900 font-semibold",
    swatch: "bg-yellow-300",
    soft: "bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-950/30 dark:to-yellow-950/20",
    card: "border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/40 dark:to-amber-950/40",
    tint: "bg-yellow-50 dark:bg-yellow-950/20",
    icon: "text-yellow-500",
    text: "text-yellow-700 dark:text-yellow-300",
  },
} as const;

/** Role-category chip, as shown on schedule cells and lists. */
export const CATEGORY_COLORS: Record<string, string> = {
  ON_CALL: "bg-red-100 text-red-800 border-red-200",
  DAYTIME: "bg-blue-100 text-blue-800 border-blue-200",
  READING: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SPECIAL: "bg-purple-100 text-purple-800 border-purple-200",
};

/** Same hues as CATEGORY_COLORS, as a light container tint for grouped form sections. */
export const CATEGORY_TINT: Record<string, string> = {
  ON_CALL: "bg-red-50 border-red-200",
  DAYTIME: "bg-blue-50 border-blue-200",
  READING: "bg-emerald-50 border-emerald-200",
  SPECIAL: "bg-purple-50 border-purple-200",
};

/** One entry per physician on the group schedule, assigned by roster order. */
export const PHYSICIAN_COLORS = [
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
