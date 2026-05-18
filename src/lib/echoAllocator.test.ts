import { describe, it, expect } from "vitest";
import {
  computeAnnualQuotas,
  computeMonthlyTargets,
  assignEchoDates,
  type ReaderSpec,
} from "./echoAllocator";

// ─── Real-world roster used across multiple tests ───────────────────────────
// Mills-Peninsula echo readers as of mid-2026. Sum of FTE = 1040.
const ROSTER: ReaderSpec[] = [
  { id: "angeja",    name: "Angeja",    fte: 170 },
  { id: "christoph", name: "Christoph", fte: 155 },
  { id: "haghighat", name: "Haghighat", fte: 200 },
  { id: "nanevicz",  name: "Nanevicz",  fte: 150 },
  { id: "shah",      name: "Shah",      fte: 165 },
  { id: "thakkar",   name: "Thakkar",   fte: 200 },
];

function sumValues(m: Map<string, number>): number {
  return [...m.values()].reduce((a, b) => a + b, 0);
}

// ─── Stage A: computeAnnualQuotas (Hamilton LRM) ────────────────────────────

describe("computeAnnualQuotas (Hamilton LRM)", () => {
  it("sums exactly to total when total = 150", () => {
    const q = computeAnnualQuotas(ROSTER, 150);
    expect(sumValues(q)).toBe(150);
  });

  it("matches expected LRM allocation for the canonical roster at N=150", () => {
    // Hand-computed:
    //   Angeja     170/1040 × 150 = 24.519 → floor 24, rem 0.519
    //   Christoph  155/1040 × 150 = 22.356 → floor 22, rem 0.356
    //   Haghighat  200/1040 × 150 = 28.846 → floor 28, rem 0.846
    //   Nanevicz   150/1040 × 150 = 21.635 → floor 21, rem 0.635
    //   Shah       165/1040 × 150 = 23.798 → floor 23, rem 0.798
    //   Thakkar    200/1040 × 150 = 28.846 → floor 28, rem 0.846
    // Floor sum = 146, leftover = 4.
    // Top 4 remainders: Haghighat (0.846), Thakkar (0.846, tied → alpha tiebreak),
    //                   Shah (0.798), Nanevicz (0.635).
    const q = computeAnnualQuotas(ROSTER, 150);
    expect(q.get("angeja")).toBe(24);
    expect(q.get("christoph")).toBe(22);
    expect(q.get("haghighat")).toBe(29);
    expect(q.get("nanevicz")).toBe(22);
    expect(q.get("shah")).toBe(24);
    expect(q.get("thakkar")).toBe(29);
  });

  it("ties on remainder break alphabetically by name (deterministic)", () => {
    // Two readers with identical FTE → identical exact share, identical remainder.
    // The +1 from the leftover MUST go to the alphabetically earlier name.
    const tied: ReaderSpec[] = [
      { id: "z", name: "Zebra", fte: 100 },
      { id: "a", name: "Apple", fte: 100 },
    ];
    const q = computeAnnualQuotas(tied, 3); // each exact share = 1.5
    // Floor=1+1=2, leftover=1 → goes to alphabetically first ("Apple")
    expect(q.get("a")).toBe(2);
    expect(q.get("z")).toBe(1);
  });

  it("returns all zeros when total=0", () => {
    const q = computeAnnualQuotas(ROSTER, 0);
    expect(sumValues(q)).toBe(0);
  });

  it("returns empty map when reader list is empty", () => {
    const q = computeAnnualQuotas([], 150);
    expect(q.size).toBe(0);
  });

  it("handles a single reader by giving them everything", () => {
    const q = computeAnnualQuotas([{ id: "x", name: "Only", fte: 200 }], 50);
    expect(q.get("x")).toBe(50);
  });

  it("is deterministic: identical inputs produce identical outputs across runs", () => {
    const a = computeAnnualQuotas(ROSTER, 150);
    const b = computeAnnualQuotas(ROSTER, 150);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it("is order-insensitive: shuffling the reader list does not change quotas", () => {
    const reversed = [...ROSTER].reverse();
    const q1 = computeAnnualQuotas(ROSTER, 150);
    const q2 = computeAnnualQuotas(reversed, 150);
    for (const r of ROSTER) {
      expect(q2.get(r.id)).toBe(q1.get(r.id));
    }
  });
});

// ─── Stage B.1: computeMonthlyTargets ────────────────────────────────────────

describe("computeMonthlyTargets", () => {
  // Build a representative Jun-Dec 2026 month-echo-day map (real values).
  const MONTH_ECHO_DAYS = new Map<number, number>([
    [6, 22], [7, 22], [8, 21], [9, 21], [10, 22], [11, 19], [12, 23],
  ]); // sums to 150

  it("monthly totals sum exactly to each month's echo-day count", () => {
    const annualQuotas = computeAnnualQuotas(ROSTER, 150);
    const targets = computeMonthlyTargets(ROSTER, MONTH_ECHO_DAYS, annualQuotas);
    for (const [month, expected] of MONTH_ECHO_DAYS) {
      const actual = [...ROSTER].reduce(
        (s, r) => s + (targets.get(r.id)?.get(month) ?? 0),
        0,
      );
      expect(actual).toBe(expected);
    }
  });

  it("annual totals per reader match Stage A quotas exactly", () => {
    const annualQuotas = computeAnnualQuotas(ROSTER, 150);
    const targets = computeMonthlyTargets(ROSTER, MONTH_ECHO_DAYS, annualQuotas);
    for (const r of ROSTER) {
      const annualSum = [...(targets.get(r.id) ?? new Map()).values()].reduce(
        (s, n) => s + n,
        0,
      );
      expect(annualSum).toBe(annualQuotas.get(r.id));
    }
  });

  it("no reader gets a target < 2 in a month where their exact share is ≥ 1.5", () => {
    const annualQuotas = computeAnnualQuotas(ROSTER, 150);
    const targets = computeMonthlyTargets(ROSTER, MONTH_ECHO_DAYS, annualQuotas);
    const totalFte = ROSTER.reduce((s, r) => s + r.fte, 0);
    for (const r of ROSTER) {
      for (const [month, echoDays] of MONTH_ECHO_DAYS) {
        const exactShare = (r.fte / totalFte) * echoDays;
        const got = targets.get(r.id)?.get(month) ?? 0;
        if (exactShare >= 1.5) {
          expect(got, `${r.name} month ${month}: exact ${exactShare.toFixed(2)} got ${got}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("is deterministic across runs", () => {
    const annualQuotas = computeAnnualQuotas(ROSTER, 150);
    const a = computeMonthlyTargets(ROSTER, MONTH_ECHO_DAYS, annualQuotas);
    const b = computeMonthlyTargets(ROSTER, MONTH_ECHO_DAYS, annualQuotas);
    for (const r of ROSTER) {
      const aMap = a.get(r.id)!;
      const bMap = b.get(r.id)!;
      for (const m of MONTH_ECHO_DAYS.keys()) {
        expect(bMap.get(m)).toBe(aMap.get(m));
      }
    }
  });

  it("handles zero-day months by giving every reader zero that month", () => {
    const m = new Map<number, number>([[1, 20], [2, 0], [3, 20]]);
    const annualQuotas = computeAnnualQuotas(ROSTER, 40);
    const targets = computeMonthlyTargets(ROSTER, m, annualQuotas);
    for (const r of ROSTER) {
      expect(targets.get(r.id)?.get(2) ?? 0).toBe(0);
    }
  });
});

// ─── Stage B.2: assignEchoDates ──────────────────────────────────────────────

// Helper: build a sequence of weekday dates for a given month
function weekdaysIn(year: number, month: number): string[] {
  const out: string[] = [];
  const cur = new Date(year, month - 1, 1);
  while (cur.getMonth() === month - 1) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      out.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
      );
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// Deterministic seeded RNG (mulberry32) — lets tests assert exact assignment.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("assignEchoDates", () => {
  it("respects isAvailable: never assigns a date to an unavailable reader", () => {
    const dates = weekdaysIn(2026, 6); // 22 weekdays
    const availableDates = new Map<number, string[]>([[6, dates]]);
    // Targets: split 22 evenly-ish across 6 readers (real LRM would do this).
    const targets = new Map<string, Map<number, number>>(
      ROSTER.map((r, i) => [r.id, new Map([[6, [4, 4, 4, 4, 3, 3][i]]])]),
    );
    // Christoph is "on vacation" for the first 10 weekdays of June.
    const vacationDates = new Set(dates.slice(0, 10));
    const isAvailable = (readerId: string, date: string): boolean => {
      if (readerId === "christoph" && vacationDates.has(date)) return false;
      return true;
    };

    const result = assignEchoDates(ROSTER, targets, availableDates, isAvailable, seededRng(1));
    for (const [date, reader] of result) {
      expect(isAvailable(reader, date)).toBe(true);
    }
  });

  it("hits exact monthly targets when no constraints force fallback", () => {
    const dates = weekdaysIn(2026, 6);
    const availableDates = new Map<number, string[]>([[6, dates]]);
    const targets = new Map<string, Map<number, number>>(
      ROSTER.map((r, i) => [r.id, new Map([[6, [4, 4, 4, 4, 3, 3][i]]])]),
    );
    const isAvailable = () => true;
    const result = assignEchoDates(ROSTER, targets, availableDates, isAvailable, seededRng(42));

    const counts = new Map<string, number>(ROSTER.map((r) => [r.id, 0]));
    for (const [, id] of result) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.get("angeja")).toBe(4);
    expect(counts.get("christoph")).toBe(4);
    expect(counts.get("haghighat")).toBe(4);
    expect(counts.get("nanevicz")).toBe(4);
    expect(counts.get("shah")).toBe(3);
    expect(counts.get("thakkar")).toBe(3);
  });

  it("Phase 3 equalizes deviations: max |actual − target| ≤ 1 when feasible", () => {
    // Construct a scenario with 3 unfillable dates (everyone on vacation).
    const dates = weekdaysIn(2026, 6);
    const availableDates = new Map<number, string[]>([[6, dates]]);
    const targets = new Map<string, Map<number, number>>(
      ROSTER.map((r, i) => [r.id, new Map([[6, [4, 4, 4, 4, 3, 3][i]]])]),
    );

    // Block 3 specific dates for ALL readers — they become unfillable.
    const unfillable = new Set([dates[5], dates[12], dates[19]]);
    const isAvailable = (_id: string, date: string): boolean => !unfillable.has(date);

    const result = assignEchoDates(ROSTER, targets, availableDates, isAvailable, seededRng(7));

    // 22 weekdays − 3 unfillable = 19 assignments expected
    expect(result.size).toBe(19);

    // Sum of targets is 22; sum of actuals is 19; deficit is 3.
    // Phase 3 should distribute the deficit so no reader is more than 1 short.
    const counts = new Map<string, number>(ROSTER.map((r) => [r.id, 0]));
    for (const [, id] of result) counts.set(id, (counts.get(id) ?? 0) + 1);

    for (const r of ROSTER) {
      const tgt = targets.get(r.id)!.get(6)!;
      const got = counts.get(r.id) ?? 0;
      const dev = got - tgt;
      expect(Math.abs(dev), `${r.name}: target ${tgt} got ${got} dev ${dev}`).toBeLessThanOrEqual(1);
    }

    // Total raw deviation must equal -3 (deficit must be absorbed)
    const totalDev = ROSTER.reduce(
      (s, r) => s + ((counts.get(r.id) ?? 0) - targets.get(r.id)!.get(6)!),
      0,
    );
    expect(totalDev).toBe(-3);
  });

  it("Phase 3 prefers high-FTE donors so losses concentrate on highest-FTE readers", () => {
    // Targets that are exactly achievable except for 1 forced loss.
    // Set up so high-FTE and low-FTE readers each have surplus options.
    const dates = weekdaysIn(2026, 6);
    const availableDates = new Map<number, string[]>([[6, dates]]);
    const targets = new Map<string, Map<number, number>>(
      ROSTER.map((r, i) => [r.id, new Map([[6, [4, 4, 4, 4, 3, 3][i]]])]),
    );

    // Block 1 specific date — forces a single -1 hit somewhere.
    const blockedDate = dates[10];
    const isAvailable = (_id: string, date: string): boolean => date !== blockedDate;

    const result = assignEchoDates(ROSTER, targets, availableDates, isAvailable, seededRng(13));
    expect(result.size).toBe(21);

    const counts = new Map<string, number>(ROSTER.map((r) => [r.id, 0]));
    for (const [, id] of result) counts.set(id, (counts.get(id) ?? 0) + 1);

    // Exactly one reader is short by 1. That reader should be Haghighat or
    // Thakkar (FTE 200, highest) — never Nanevicz (FTE 150, lowest).
    const deficits = ROSTER
      .filter((r) => (counts.get(r.id) ?? 0) < targets.get(r.id)!.get(6)!)
      .map((r) => r.name);
    expect(deficits).toHaveLength(1);
    expect(["Haghighat", "Thakkar"]).toContain(deficits[0]);
  });

  it("seeded RNG produces stable assignment maps across runs", () => {
    const dates = weekdaysIn(2026, 6);
    const availableDates = new Map<number, string[]>([[6, dates]]);
    const targets = new Map<string, Map<number, number>>(
      ROSTER.map((r, i) => [r.id, new Map([[6, [4, 4, 4, 4, 3, 3][i]]])]),
    );
    const isAvailable = () => true;
    const a = assignEchoDates(ROSTER, targets, availableDates, isAvailable, seededRng(2024));
    const b = assignEchoDates(ROSTER, targets, availableDates, isAvailable, seededRng(2024));
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});
