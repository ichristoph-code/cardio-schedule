"use client";

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
}

function buildVacationSet(vacations: VacationInfo[]): Map<string, "full" | "half"> {
  const map = new Map<string, "full" | "half">();
  for (const v of vacations) {
    const start = new Date(v.startDate + "T12:00:00");
    const end = new Date(v.endDate + "T12:00:00");
    const isHalf = v.halfDay && v.halfDay !== "NONE";
    const cur = new Date(start);
    while (cur <= end) {
      const key = cur.toISOString().split("T")[0];
      map.set(key, isHalf ? "half" : "full");
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

function MonthGrid({ year, month, vacMap, floatSet }: { year: number; month: number; vacMap: Map<string, "full" | "half">; floatSet: Set<string> }) {
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
          const isFloat = floatSet.has(dateStr);
          const isToday = dateStr === today;

          return (
            <div
              key={i}
              title={vac ? (vac === "half" ? "Half vacation day" : "Vacation day") : isFloat ? "Hospital Float" : undefined}
              className={[
                "text-[11px] text-center rounded py-[3px] leading-none select-none",
                vac === "full"
                  ? "bg-emerald-500 text-white font-semibold"
                  : vac === "half"
                    ? "bg-emerald-200 text-emerald-900 font-semibold"
                    : isFloat
                      ? "bg-blue-400 text-white font-semibold"
                      : isToday
                        ? "bg-primary/15 text-primary font-bold"
                        : "text-foreground hover:bg-muted/50",
              ].join(" ")}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function YearlyVacationCalendar({ year, vacations, floatDays = [] }: Props) {
  const vacMap = buildVacationSet(vacations);
  const floatSet = new Set(floatDays);

  const totalFull = [...vacMap.values()].filter((v) => v === "full").length;
  const totalHalf = [...vacMap.values()].filter((v) => v === "half").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-muted-foreground">Full day — <strong>{totalFull}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200" />
          <span className="text-muted-foreground">Half day — <strong>{totalHalf}</strong></span>
        </div>
        <div className="text-muted-foreground">
          Total: <strong>{totalFull + totalHalf * 0.5}</strong> days
        </div>
        {floatDays.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" />
              <span className="text-muted-foreground">Hospital Float — <strong>{floatDays.length}</strong></span>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid key={m} year={year} month={m} vacMap={vacMap} floatSet={floatSet} />
        ))}
      </div>
    </div>
  );
}
