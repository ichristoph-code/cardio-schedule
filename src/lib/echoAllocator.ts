/**
 * Echo-reader two-stage allocator
 *
 * Stage A  –  computeAnnualQuotas()
 *   Pure Hamilton (largest-remainder) allocation.
 *   No I/O, no RNG, 100 % deterministic.
 *   Tie-break: highest remainder first; equal remainders → name ascending.
 *
 * Stage B  –  computeMonthlyTargets() + assignEchoDates()
 *
 *   B.1  computeMonthlyTargets()
 *     For each calendar month, run Hamilton on that month's echo-day count
 *     with FTE weights → per-reader integer targets that sum exactly to that
 *     month's echo-day count.
 *     Then enforce a minimum of 2: any reader whose exact proportion for a
 *     month is ≥ 1.5 but received only 1 from LRM is bumped to 2 by taking
 *     one day from the reader with the highest target that month (must have
 *     ≥ 3, so they remain ≥ 2 after giving).  Monthly sum is preserved.
 *     No RNG.  Fully deterministic.
 *
 *   B.2  assignEchoDates()
 *     Within each month, shuffles available echo dates and assigns each
 *     reader exactly their Stage B.1 target count (respecting per-date
 *     availability).  Randomness is confined to this function only.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ReaderSpec {
  id: string;
  /** Alphabetical tiebreak key – use "LastnameFirstname" to match DB sort order */
  name: string;
  fte: number;
}

// ---------------------------------------------------------------------------
// Internal helper: Hamilton largest-remainder
// ---------------------------------------------------------------------------

/**
 * Allocate `total` integer units among `items` by Hamilton largest-remainder.
 * Tie-break: highest remainder first; equal remainder → tieKey ascending (localeCompare).
 * Guarantee: sum of result values === total (when total > 0).
 * Never uses random numbers.
 */
function lrm(
  items: { id: string; tieKey: string; weight: number }[],
  total: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  if (total === 0) {
    items.forEach((it) => out.set(it.id, 0));
    return out;
  }
  const totalWeight = items.reduce((s, it) => s + it.weight, 0);
  if (totalWeight === 0) {
    items.forEach((it) => out.set(it.id, 0));
    return out;
  }

  const rows = items.map((it) => {
    const exact = (it.weight / totalWeight) * total;
    const floor = Math.floor(exact);
    return { id: it.id, tieKey: it.tieKey, floor, rem: exact - floor };
  });

  const leftover = total - rows.reduce((s, r) => s + r.floor, 0);

  // Sort: remainder desc, then tieKey asc — deterministic, no RNG
  const sorted = [...rows].sort(
    (a, b) => b.rem - a.rem || a.tieKey.localeCompare(b.tieKey),
  );

  sorted.forEach((r, i) => {
    out.set(r.id, r.floor + (i < leftover ? 1 : 0));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Stage A — annual quotas
// ---------------------------------------------------------------------------

/**
 * Compute FTE-proportional annual echo-reading quotas.
 *
 * @param readers       Readers with id, name (tiebreak key), and fte weight.
 *                      Input order is irrelevant; tiebreak is always name-based.
 * @param totalEchoDays N — total echo-reading days in the period.
 * @returns             Map<readerId, annualQuota>.  Values sum exactly to N.
 *
 * Unit-test assertion for N = 150 with the Mills-Penn echo-reader roster
 * (Σ FTE = 5.200):
 *   Haghighat 1.000 → 29
 *   Thakkar   1.000 → 29
 *   Shah      0.825 → 24
 *   Angeja    0.850 → 24   ← note: Angeja remainder (0.519) < Shah (0.798),
 *   Nanevicz  0.750 → 22     so Shah wins the 3rd bump, not Angeja
 *   Christoph 0.775 → 22
 *   Sum                150
 */
export function computeAnnualQuotas(
  readers: ReaderSpec[],
  totalEchoDays: number,
): Map<string, number> {
  return lrm(
    readers.map((r) => ({ id: r.id, tieKey: r.name, weight: r.fte })),
    totalEchoDays,
  );
}

// ---------------------------------------------------------------------------
// Stage B.1 — monthly targets
// ---------------------------------------------------------------------------

/**
 * Split the echo-reading load across calendar months.
 *
 * Step 1 — per-month Hamilton: for each month m, run LRM on monthEchoDays[m]
 *   with FTE weights so that sum_readers(target[r][m]) === monthEchoDays[m].
 *
 * Step 2 — annual reconciliation: after step 1 the per-reader sums may differ
 *   from the Stage A annual quotas because each month's remainder pattern is
 *   independent.  We repair this with within-month swaps: a reader who is
 *   over-quota gives one day to a reader who is under-quota, in a month where
 *   both the swap is feasible (giver ≥ 3 post-swap, receiver doesn't violate
 *   anything).  Monthly sums are preserved throughout; annual totals converge
 *   exactly to Stage A after at most O(readers × months) iterations.
 *
 * Step 3 — minimum-2 enforcement: any reader whose exact FTE proportion for a
 *   month is ≥ 1.5 but has only 1 after steps 1-2 is bumped to 2 via another
 *   within-month swap.
 *
 * @param readers        Same reader list as Stage A.
 * @param monthEchoDays  Map from month (1–12) to echo-day count.
 * @param annualQuotas   Output of computeAnnualQuotas() for the same period.
 *                       Pass this so Stage B targets exactly match Stage A.
 * @returns  Map<readerId, Map<month, integerTarget>>
 *           Invariants (both hold simultaneously):
 *             • sum_r(result[r][m]) === monthEchoDays[m]  for every month m
 *             • sum_m(result[r][m]) === annualQuotas[r]   for every reader r
 */
export function computeMonthlyTargets(
  readers: ReaderSpec[],
  monthEchoDays: Map<number, number>,
  annualQuotas: Map<string, number>,
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  readers.forEach((r) => result.set(r.id, new Map()));

  const totalFte = readers.reduce((s, r) => s + r.fte, 0);
  if (totalFte === 0) return result;

  const months = [...monthEchoDays.entries()]
    .filter(([, d]) => d > 0)
    .map(([m]) => m)
    .sort((a, b) => a - b);

  // -------------------------------------------------------------------------
  // Step 1 — per-month Hamilton
  // -------------------------------------------------------------------------
  for (const month of months) {
    const echoDays = monthEchoDays.get(month)!;
    const monthTargets = lrm(
      readers.map((r) => ({ id: r.id, tieKey: r.name, weight: r.fte })),
      echoDays,
    );
    readers.forEach((r) => result.get(r.id)!.set(month, monthTargets.get(r.id) ?? 0));
  }

  // -------------------------------------------------------------------------
  // Step 2 — annual reconciliation via within-month swaps
  //
  // Helper: compute each reader's current annual sum.
  // -------------------------------------------------------------------------
  const annualSum = (): Map<string, number> => {
    const m = new Map<string, number>();
    readers.forEach((r) => {
      m.set(r.id, months.reduce((s, mo) => s + (result.get(r.id)!.get(mo) ?? 0), 0));
    });
    return m;
  };

  // Repeat until no reader is over- or under-quota.
  // In practice 1–2 passes suffice; cap at 200 to be safe.
  //
  // Fix A: sort giver/receiver loops by surplus/deficit magnitude rather than
  // insertion order. This makes the most-surplus reader donate first and the
  // most-deficient reader receive first — the original alphabetical iteration
  // could leave fixable imbalances on the table when the surplus/deficit
  // structure didn't happen to align with reader name order.
  for (let pass = 0; pass < 200; pass++) {
    const sums = annualSum();
    let changed = false;

    const givers = [...readers].sort((a, b) => {
      const surA = (sums.get(a.id)! - (annualQuotas.get(a.id) ?? 0));
      const surB = (sums.get(b.id)! - (annualQuotas.get(b.id) ?? 0));
      return surB - surA || a.name.localeCompare(b.name);
    });

    for (const giver of givers) {
      const giverSum = sums.get(giver.id)!;
      const giverQuota = annualQuotas.get(giver.id) ?? 0;
      if (giverSum <= giverQuota) continue; // already at or under target

      // Find a month where giver has ≥ 3 (stays ≥ 2 after giving) and a
      // receiver who is under-quota and can accept a day in that month.
      // Take from the highest-count months first so reductions are spread
      // evenly rather than always landing on the earliest calendar month.
      const monthsByGiverCount = [...months].sort((a, b) => {
        const ca = result.get(giver.id)!.get(a) ?? 0;
        const cb = result.get(giver.id)!.get(b) ?? 0;
        return cb - ca || a - b;
      });

      // Receivers sorted by deficit magnitude (largest deficit first)
      const receivers = [...readers].sort((a, b) => {
        const defA = ((annualQuotas.get(a.id) ?? 0) - sums.get(a.id)!);
        const defB = ((annualQuotas.get(b.id) ?? 0) - sums.get(b.id)!);
        return defB - defA || a.name.localeCompare(b.name);
      });

      swapSearch:
      for (const month of monthsByGiverCount) {
        const giverCur = result.get(giver.id)!.get(month) ?? 0;
        if (giverCur < 3) continue; // can't give without dropping below 2

        for (const receiver of receivers) {
          if (receiver.id === giver.id) continue;
          const receiverSum = sums.get(receiver.id)!;
          const receiverQuota = annualQuotas.get(receiver.id) ?? 0;
          if (receiverSum >= receiverQuota) continue; // already satisfied

          // Do the swap
          result.get(giver.id)!.set(month, giverCur - 1);
          const receiverCur = result.get(receiver.id)!.get(month) ?? 0;
          result.get(receiver.id)!.set(month, receiverCur + 1);
          sums.set(giver.id, giverSum - 1);
          sums.set(receiver.id, receiverSum + 1);
          changed = true;
          break swapSearch;
        }
      }
    }

    if (!changed) break;
  }

  // -------------------------------------------------------------------------
  // Step 3 — minimum-2 enforcement (within-month swap, monthly sum preserved)
  // -------------------------------------------------------------------------
  for (const month of months) {
    const echoDays = monthEchoDays.get(month)!;
    for (const reader of readers) {
      const cur = result.get(reader.id)!.get(month)!;
      if (cur >= 2) continue;

      const exactProportion = (reader.fte / totalFte) * echoDays;
      if (exactProportion < 1.5) continue;

      const donor = readers
        .filter((r) => r.id !== reader.id)
        .map((r) => ({ r, t: result.get(r.id)!.get(month)! }))
        .filter(({ t }) => t >= 3)
        .sort((a, b) => b.t - a.t || a.r.name.localeCompare(b.r.name))[0];

      if (!donor) continue;

      result.get(reader.id)!.set(month, 2);
      result.get(donor.r.id)!.set(month, donor.t - 1);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stage B.2 — assign specific dates
// ---------------------------------------------------------------------------

/**
 * Assign specific echo dates to readers within each month.
 *
 * THIS IS THE ONLY FUNCTION PERMITTED TO USE RANDOMNESS.
 * Annual and monthly counts are fully determined by Stage A / Stage B.1;
 * only which specific dates each reader gets may vary across runs.
 *
 * @param readers          Reader list (ordering used for fallback pass).
 * @param monthlyTargets   Output of computeMonthlyTargets().
 * @param availableDates   Map from month → sorted array of echo-date strings.
 * @param isAvailable      Returns true iff the reader can work that date
 *                         (vacation / weekly-day-off checks).
 * @param rng              RNG function — pass a seeded RNG for reproducible
 *                         tests, or omit to use Math.random.
 * @returns  Map<dateString, readerId>
 */
export function assignEchoDates(
  readers: ReaderSpec[],
  monthlyTargets: Map<string, Map<number, number>>,
  availableDates: Map<number, string[]>,
  isAvailable: (readerId: string, dateStr: string) => boolean,
  rng: () => number = Math.random,
): Map<string, string> {
  const result = new Map<string, string>(); // dateStr → readerId

  const months = [...availableDates.keys()].sort((a, b) => a - b);

  // -------------------------------------------------------------------------
  // Phase 1 — Per-month greedy assignment.
  //
  // For each calendar month we:
  //   a. Shuffle this month's echo dates (the only RNG step).
  //   b. Run a per-date greedy: assign each date to the reader with the
  //      highest remaining monthly deficit who is available on that date.
  //      Tiebreak: fewest available days in THIS month (most constrained
  //      reader first) → deterministic alphabetical.
  //   c. Last-resort: if nobody with a positive remaining target is
  //      available for a date, assign it to the first available reader
  //      anyway — marking that reader as "over-quota" for this month.
  //   d. Intra-month repair: for each under-quota reader U, swap a date
  //      with an over-quota reader X (one who received a last-resort date)
  //      if U is available on that date.
  //
  // Processing month-by-month preserves the per-month targets from
  // Stage B.1, giving an even, lump-free schedule.
  // -------------------------------------------------------------------------
  const monthFilled = new Map<string, Map<string, number>>(); // month → readerId → count

  for (const month of months) {
    const rawDates = availableDates.get(month) ?? [];
    if (rawDates.length === 0) continue;

    // Shuffle dates for this month
    const dates = [...rawDates];
    for (let i = dates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dates[i], dates[j]] = [dates[j], dates[i]];
    }

    // Per-reader targets and fill counts for this month
    const mTarget = new Map<string, number>();
    const mFilled = new Map<string, number>();
    for (const r of readers) {
      mTarget.set(r.id, monthlyTargets.get(r.id)?.get(month) ?? 0);
      mFilled.set(r.id, 0);
    }

    // Availability count per reader within this month only (tiebreak)
    const mAvail = new Map<string, number>();
    for (const r of readers) {
      let cnt = 0;
      for (const d of rawDates) if (isAvailable(r.id, d)) cnt++;
      mAvail.set(r.id, cnt);
    }

    // Per-date greedy within this month
    for (const d of dates) {
      let bestId: string | null = null;
      let bestRem = 0;
      let bestAvail = Infinity;
      let bestName = "";

      for (const r of readers) {
        const rem = (mTarget.get(r.id) ?? 0) - (mFilled.get(r.id) ?? 0);
        if (rem <= 0) continue;
        if (!isAvailable(r.id, d)) continue;
        const avail = mAvail.get(r.id) ?? 0;
        if (
          rem > bestRem ||
          (rem === bestRem && avail < bestAvail) ||
          (rem === bestRem && avail === bestAvail && r.name < bestName)
        ) {
          bestRem = rem;
          bestId = r.id;
          bestAvail = avail;
          bestName = r.name;
        }
      }

      if (bestId !== null) {
        result.set(d, bestId);
        mFilled.set(bestId, (mFilled.get(bestId) ?? 0) + 1);
      } else {
        // Last resort: any available reader, even over-target
        const fallback = readers.find((r) => isAvailable(r.id, d));
        if (fallback) {
          result.set(d, fallback.id);
          mFilled.set(fallback.id, (mFilled.get(fallback.id) ?? 0) + 1);
        }
      }
    }

    // Intra-month repair: swap over-quota dates to under-quota readers
    for (const u of readers) {
      const uTarget = mTarget.get(u.id) ?? 0;
      let uFilled = mFilled.get(u.id) ?? 0;
      if (uFilled >= uTarget) continue;

      for (const d of dates) {
        if (uFilled >= uTarget) break;
        const xId = result.get(d);
        if (!xId || xId === u.id) continue;
        // X must be over their monthly target (they absorbed a last-resort date)
        if ((mFilled.get(xId) ?? 0) <= (mTarget.get(xId) ?? 0)) continue;
        if (!isAvailable(u.id, d)) continue;
        result.set(d, u.id);
        mFilled.set(u.id, uFilled + 1);
        mFilled.set(xId, (mFilled.get(xId) ?? 0) - 1);
        uFilled++;
      }
    }

    monthFilled.set(String(month), mFilled);
  }

  // -------------------------------------------------------------------------
  // Phase 2 — Global annual repair via augmenting-path swaps.
  //
  // After per-month processing, compute each reader's annual total.  If any
  // reader is under their annual quota (vacation constraints prevented them
  // from hitting monthly targets), we fix it by finding dates currently
  // assigned to other readers that the under-quota reader can cover, and
  // routing those readers to dates that are currently unassigned (or doing
  // multi-hop chains).
  //
  // This pass preserves all monthly assignments from Phase 1 as much as
  // possible — it only touches the minimum number of dates needed.
  // -------------------------------------------------------------------------
  const annualTarget = new Map<string, number>();
  for (const r of readers) {
    let total = 0;
    for (const [, m] of monthlyTargets.get(r.id) ?? new Map()) total += m;
    annualTarget.set(r.id, total);
  }

  const annualActual = (): Map<string, number> => {
    const m = new Map<string, number>();
    readers.forEach((r) => m.set(r.id, 0));
    for (const [, physId] of result) m.set(physId, (m.get(physId) ?? 0) + 1);
    return m;
  };

  const allDates = [...months].flatMap((m) => availableDates.get(m) ?? []);

  for (let pass = 0; pass < 50; pass++) {
    const actual = annualActual();
    const annualRemaining = new Map(
      readers.map((r) => [r.id, (annualTarget.get(r.id) ?? 0) - (actual.get(r.id) ?? 0)])
    );

    // Check for any reader still under quota
    const underReader = readers.find((r) => (annualRemaining.get(r.id) ?? 0) > 0);
    if (!underReader) break;

    const u = underReader;
    const uRem = annualRemaining.get(u.id)!;
    const unassigned = allDates.filter((d) => !result.has(d));

    let anyFix = false;

    // 1-hop: U takes d1 from X, X takes dOut
    outer1:
    for (const dOut of unassigned) {
      for (const [d1, xId] of result) {
        if (xId === u.id) continue;
        if (!isAvailable(u.id, d1)) continue;
        if (!isAvailable(xId, dOut)) continue;
        result.set(d1, u.id);
        result.set(dOut, xId);
        unassigned.splice(unassigned.indexOf(dOut), 1);
        anyFix = true;
        break outer1;
      }
    }

    if (!anyFix) {
      // 2-hop: U takes d1 from X, X takes d2 from Y, Y takes dOut
      outer2:
      for (const dOut of unassigned) {
        for (const [d1, xId] of result) {
          if (xId === u.id) continue;
          if (!isAvailable(u.id, d1)) continue;
          for (const [d2, yId] of result) {
            if (yId === u.id || yId === xId) continue;
            if (!isAvailable(xId, d2)) continue;
            if (!isAvailable(yId, dOut)) continue;
            result.set(d1, u.id);
            result.set(d2, xId);
            result.set(dOut, yId);
            unassigned.splice(unassigned.indexOf(dOut), 1);
            anyFix = true;
            break outer2;
          }
        }
      }
    }

    if (!anyFix) break;
  }

  // -------------------------------------------------------------------------
  // Phase 3 — deviation equalization (Fix B).
  //
  // Goal: minimize max |actual − target| across readers.
  //
  // Phase 2 above can only repair via unassigned dates. When the unassigned
  // dates are truly unfillable (everyone-on-vacation days), the total deficit
  // can't be eliminated — but it CAN be spread evenly so no single reader
  // takes a disproportionate hit.
  //
  // Rule: while there exists a pair (donor D, receiver R) where
  // `dev(D) − dev(R) ≥ 2` AND D currently holds a date that R can do, swap
  // it. After the swap, dev(D) drops by 1 and dev(R) rises by 1, so the
  // spread tightens by 2. Iteration stops when no pair has spread ≥ 2 —
  // i.e., every deviation lies in a window of width ≤ 1.
  //
  // This subsumes the simpler "surplus → deficit" rule and additionally
  // distributes unfillable-date losses evenly across the roster.
  //
  // Cap at 100 iterations; each is O(readers² · |dates|).
  // -------------------------------------------------------------------------
  for (let pass = 0; pass < 100; pass++) {
    const actual = annualActual();
    const dev = new Map<string, number>(
      readers.map((r) => [r.id, (actual.get(r.id) ?? 0) - (annualTarget.get(r.id) ?? 0)]),
    );

    // Sort donors high-dev first, then high-FTE first (FTE-normalized loss is
    // smaller for high-FTE readers, so we'd rather take from them when devs
    // tie). Receivers: low-dev first, then low-FTE first (a loss hurts more
    // for low-FTE readers, so they should be filled first). Name asc for full
    // determinism.
    const donors = [...readers].sort((a, b) =>
      (dev.get(b.id) ?? 0) - (dev.get(a.id) ?? 0)
      || b.fte - a.fte
      || a.name.localeCompare(b.name),
    );
    const receivers = [...readers].sort((a, b) =>
      (dev.get(a.id) ?? 0) - (dev.get(b.id) ?? 0)
      || a.fte - b.fte
      || a.name.localeCompare(b.name),
    );

    let swapped = false;

    outer:
    for (const r of receivers) {
      for (const d of donors) {
        if (d.id === r.id) continue;
        // Improvement condition: swap strictly tightens the spread.
        if ((dev.get(d.id) ?? 0) - (dev.get(r.id) ?? 0) < 2) continue;
        for (const [date, holderId] of result) {
          if (holderId !== d.id) continue;
          if (!isAvailable(r.id, date)) continue;
          result.set(date, r.id);
          swapped = true;
          break outer;
        }
      }
    }

    if (!swapped) break;
  }

  return result;
}
