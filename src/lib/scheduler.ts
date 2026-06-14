import { prisma } from "./prisma";
import { computeMonthlyTargets, assignEchoDates, ReaderSpec } from "./echoAllocator";

// --- Date Helpers ---

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Prisma returns Date objects as UTC midnight. Convert to local-midnight so that
// formatDate() (which uses local getters) produces the correct calendar date string.
function toLocalMidnight(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** 1=Mon … 7=Sun */
function dayOfWeek(dateStr: string): number {
  const d = parseDate(dateStr);
  const js = d.getDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

function isWeekend(dow: number): boolean {
  return dow >= 6;
}

function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

// --- Hamilton (Largest-Remainder) Allocator ---

// Caller should pre-sort the weights array by the desired tiebreak order
// (e.g. lastName, firstName). Ties in remainder are broken by original input index.
function hamiltonAllocate(
  weights: { id: string; weight: number }[],
  total: number
): Record<string, number> {
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  if (totalWeight === 0 || total === 0) return {};
  const raw = weights.map((w, i) => {
    const exact = (w.weight / totalWeight) * total;
    return { id: w.id, floor: Math.floor(exact), rem: exact - Math.floor(exact), origIdx: i };
  });
  const remaining = total - raw.reduce((s, r) => s + r.floor, 0);
  raw.sort((a, b) => b.rem - a.rem || a.origIdx - b.origIdx);
  const result: Record<string, number> = {};
  raw.forEach((r, i) => {
    result[r.id] = r.floor + (i < remaining ? 1 : 0);
  });
  return result;
}

// --- Holiday Date Calculator ---

function getHolidayDatesForYear(year: number): Map<string, string> {
  const map = new Map<string, string>();

  // Fixed dates
  map.set(formatDate(new Date(year, 0, 1)), "New Year's Day");
  map.set(formatDate(new Date(year, 6, 4)), "Independence Day");
  map.set(formatDate(new Date(year, 11, 24)), "Christmas Eve");
  map.set(formatDate(new Date(year, 11, 25)), "Christmas Day");

  // Memorial Day: last Monday of May
  const memDay = new Date(year, 4, 31);
  while (memDay.getDay() !== 1) memDay.setDate(memDay.getDate() - 1);
  map.set(formatDate(memDay), "Memorial Day");

  // Labor Day: first Monday of September
  const labDay = new Date(year, 8, 1);
  while (labDay.getDay() !== 1) labDay.setDate(labDay.getDate() + 1);
  map.set(formatDate(labDay), "Labor Day");

  // Thanksgiving: fourth Thursday of November
  const tg = new Date(year, 10, 1);
  while (tg.getDay() !== 4) tg.setDate(tg.getDate() + 1);
  tg.setDate(tg.getDate() + 21);
  map.set(formatDate(tg), "Thanksgiving");

  return map;
}

// --- Types ---

interface PhysicianData {
  id: string;
  firstName: string;
  lastName: string;
  fteDays: number;
  isInterventionalist: boolean;
  isEP: boolean;
  officeDays: number[];
  eligibleRoleIds: Set<string>;
  preferredTaskDay: number | null;
}

interface RoleData {
  id: string;
  name: string;
  displayName: string;
  category: string;
  sortOrder: number;
}

export interface ScheduleStats {
  totalAssignments: number;
  byRole: Record<string, Record<string, number>>; // roleId -> physicianId -> count
  byPhysician: Record<string, number>;
  holidays: Record<string, Record<string, string>>; // holidayName -> roleId -> physicianId
  unfilledSlots: { date: string; roleName: string }[];
}

function countReadingDaysInMonth(year: number, month: number, holidayDates: Map<string, string>): number {
  let count = 0;
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const ds = formatDate(d);
    const dw = dayOfWeek(ds);
    if (!isWeekend(dw) && !holidayDates.has(ds)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// --- Main Engine ---

export async function generateSchedule(
  year: number,
  roleTypeIds?: string[],
  startMonth?: number, // 1–12, inclusive
  endMonth?: number,   // 1–12, inclusive
): Promise<{
  scheduleId: string;
  stats: ScheduleStats;
  assignmentCount: number;
}> {
  const isPartial = roleTypeIds && roleTypeIds.length > 0;
  const hasDateRange = startMonth !== undefined || endMonth !== undefined;
  const rangeStart = new Date(year, (startMonth ?? 1) - 1, 1);
  const rangeEnd = new Date(year, endMonth ?? 12, 0); // last day of endMonth

  // Check for existing schedule
  const existing = await prisma.schedule.findUnique({ where: { year } });

  if (existing) {
    if (!isPartial && !hasDateRange) {
      // Full regeneration: wipe everything
      await prisma.holidayAssignment.deleteMany({ where: { year } });
      await prisma.scheduleAssignment.deleteMany({ where: { scheduleId: existing.id } });
      await prisma.schedule.delete({ where: { id: existing.id } });
    } else {
      // Scoped regeneration: delete only selected roles within date range
      await prisma.scheduleAssignment.deleteMany({
        where: {
          scheduleId: existing.id,
          ...(isPartial ? { roleTypeId: { in: roleTypeIds } } : {}),
          ...(hasDateRange ? { date: { gte: rangeStart, lte: rangeEnd } } : {}),
        },
      });
      await prisma.schedule.update({
        where: { id: existing.id },
        data: { status: "DRAFT", generatedAt: new Date() },
      });
    }
  }

  // Load data
  const physicians = await prisma.physician.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { eligibilities: true, officeDays: true },
  });

  const roleTypes = await prisma.roleType.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const rules = await prisma.schedulingRule.findMany({
    where: { isActive: true },
    include: { physician: true },
  });

  const dbHolidays = await prisma.holiday.findMany();
  const holidayWeights: Record<string, number> = {};
  const holidayIdMap: Record<string, string> = {};
  for (const h of dbHolidays) {
    holidayWeights[h.name] = h.weight;
    holidayIdMap[h.name] = h.id;
  }

  // Vacations
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const vacations = await prisma.vacationRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
    },
  });

  const vacationDays = new Map<string, Set<string>>();
  // Dates where a physician is only working a half day (MORNING/AFTERNOON vacation).
  // Used to bar READING (study-reading) assignments — a half-day MD isn't present
  // long enough to carry a full day's interpretive reading load. Half-day dates are
  // also present in vacationDays (full-day block), so this set is currently
  // redundant for availability, but it codifies the reading rule independently.
  const halfDayDays = new Map<string, Set<string>>();
  for (const v of vacations) {
    const dates = vacationDays.get(v.physicianId) ?? new Set<string>();
    const s = new Date(Math.max(toLocalMidnight(v.startDate).getTime(), yearStart.getTime()));
    const e = new Date(Math.min(toLocalMidnight(v.endDate).getTime(), yearEnd.getTime()));
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const ds = formatDate(d);
      dates.add(ds);
      if (v.halfDay === "MORNING" || v.halfDay === "AFTERNOON") {
        const half = halfDayDays.get(v.physicianId) ?? new Set<string>();
        half.add(ds);
        halfDayDays.set(v.physicianId, half);
      }
    }
    vacationDays.set(v.physicianId, dates);
  }

  // No-call days (block ON_CALL roles only)
  const noCallDays = await prisma.noCallDayRequest.findMany({
    where: {
      status: "APPROVED",
      date: { gte: yearStart, lte: yearEnd },
    },
  });
  const noCallDaySet = new Map<string, Set<string>>();
  for (const nc of noCallDays) {
    const dates = noCallDaySet.get(nc.physicianId) ?? new Set<string>();
    dates.add(formatDate(toLocalMidnight(nc.date)));
    noCallDaySet.set(nc.physicianId, dates);
  }

  // Weekly recurring days off (block all roles on that day of week)
  const weeklyDaysOffRecords = await prisma.physicianWeeklyDayOff.findMany();
  const weeklyDayOffMap = new Map<string, Set<number>>();
  for (const wd of weeklyDaysOffRecords) {
    const days = weeklyDayOffMap.get(wd.physicianId) ?? new Set<number>();
    days.add(wd.dayOfWeek);
    weeklyDayOffMap.set(wd.physicianId, days);
  }

  // Historical holiday burden (prior years)
  const priorHA = await prisma.holidayAssignment.findMany({
    where: { year: { lt: year } },
    include: { holiday: true },
  });
  const holidayBurden = new Map<string, number>();
  for (const ha of priorHA) {
    const w = holidayWeights[ha.holiday.name] ?? 1;
    holidayBurden.set(ha.physicianId, (holidayBurden.get(ha.physicianId) ?? 0) + w);
  }

  // Build physician data
  const physData: PhysicianData[] = physicians.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fteDays: p.fteDays,
    isInterventionalist: p.isInterventionalist,
    isEP: p.isEP,
    officeDays: p.officeDays.map((od) => od.dayOfWeek),
    eligibleRoleIds: new Set(p.eligibilities.map((e) => e.roleTypeId)),
    preferredTaskDay: p.preferredTaskDay ?? null,
  }));

  const roleData: RoleData[] = roleTypes.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.displayName,
    category: r.category,
    sortOrder: r.sortOrder,
  }));

  // Tracking structures (declared before pre-seed so partial regen can populate them)
  const assignmentCount: Record<string, Record<string, number>> = {};
  const dailyPhysicianRoles = new Map<string, Set<string>>();
  const lastAssigned: Record<string, Record<string, string>> = {};
  const handledRoleDays = new Set<string>();
  const weekendCallBlocks = new Map<string, string>();
  const weekendBlockCount: Record<string, Record<string, number>> = {};
  const weekdayCallCount: Record<string, Record<string, number>> = {};
  const weeklyRounderBlocks = new Map<string, string>();
  // remainingQuota[roleId][physicianId] counts down from Hamilton target to 0.
  // Drives READING assignment — physicians with more remaining are preferred.
  const remainingQuota: Record<string, Record<string, number>> = {};
  // monthlyRemaining[roleId][month][physicianId]: per-month Hamilton quota countdown.
  // Prevents any physician from dominating a single month even if they have annual quota left.
  const monthlyRemaining: Record<string, Record<number, Record<string, number>>> = {};

  for (const role of roleData) {
    assignmentCount[role.id] = {};
    weekendBlockCount[role.id] = {};
    weekdayCallCount[role.id] = {};
  }

  const totalDaysInYear = isLeapYear(year) ? 366 : 365;

  const assignments: { date: string; roleTypeId: string; physicianId: string }[] = [];
  const stats: ScheduleStats = {
    totalAssignments: 0,
    byRole: {},
    byPhysician: {},
    holidays: {},
    unfilledSlots: [],
  };

  // Pre-seed tracking state from assignments we're keeping (different role or outside date range)
  // so the scheduler respects already-assigned slots when placing new ones.
  if ((isPartial || hasDateRange) && existing) {
    const keptWhere: Record<string, unknown> = { scheduleId: existing.id, isActive: true };
    if (isPartial && hasDateRange) {
      keptWhere.OR = [
        { roleTypeId: { notIn: roleTypeIds } },
        { date: { lt: rangeStart } },
        { date: { gt: rangeEnd } },
      ];
    } else if (isPartial) {
      keptWhere.roleTypeId = { notIn: roleTypeIds };
    } else {
      // date range only — keep everything outside the range
      keptWhere.OR = [{ date: { lt: rangeStart } }, { date: { gt: rangeEnd } }];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keptAssignments = await (prisma.scheduleAssignment.findMany as any)({ where: keptWhere });

    for (const a of keptAssignments) {
      const dateStr = formatDate(toLocalMidnight(a.date));
      const dow = dayOfWeek(dateStr);
      const roleInfo = roleData.find((r) => r.id === a.roleTypeId);
      if (!roleInfo) continue;

      const key = `${dateStr}:${a.physicianId}`;
      if (!dailyPhysicianRoles.has(key)) dailyPhysicianRoles.set(key, new Set());
      dailyPhysicianRoles.get(key)!.add(a.roleTypeId);

      if (!assignmentCount[a.roleTypeId]) assignmentCount[a.roleTypeId] = {};
      assignmentCount[a.roleTypeId][a.physicianId] = (assignmentCount[a.roleTypeId][a.physicianId] ?? 0) + 1;

      if (!lastAssigned[a.physicianId]) lastAssigned[a.physicianId] = {};
      const prev = lastAssigned[a.physicianId][a.roleTypeId];
      if (!prev || dateStr > prev) lastAssigned[a.physicianId][a.roleTypeId] = dateStr;

      if (roleInfo.category === "ON_CALL" && dow === 5) {
        weekendCallBlocks.set(`${dateStr}:${a.roleTypeId}`, a.physicianId);
        if (!weekendBlockCount[a.roleTypeId]) weekendBlockCount[a.roleTypeId] = {};
        weekendBlockCount[a.roleTypeId][a.physicianId] = (weekendBlockCount[a.roleTypeId][a.physicianId] ?? 0) + 1;
      }
      if (roleInfo.category === "ON_CALL" && dow >= 1 && dow <= 4) {
        if (!weekdayCallCount[a.roleTypeId]) weekdayCallCount[a.roleTypeId] = {};
        weekdayCallCount[a.roleTypeId][a.physicianId] = (weekdayCallCount[a.roleTypeId][a.physicianId] ?? 0) + 1;
      }
      if ((roleInfo.name === "HOSPITAL_ROUNDER" || roleInfo.name === "ICU_ROUNDER") && dow === 1) {
        weeklyRounderBlocks.set(`${dateStr}:${a.roleTypeId}`, a.physicianId);
      }
    }
  }

  // Sort roles: category first (ON_CALL → DAYTIME → READING → SPECIAL),
  // then by pool size within each category (most constrained first).
  // DAYTIME must precede READING so hospital/ICU rounders are assigned before
  // reading roles run — otherwise the "skip readers who are rounders" check
  // fires too late and rounders end up with reading assignments on the same day.
  const categoryOrder: Record<string, number> = {
    ON_CALL: 0,
    DAYTIME: 1,
    READING: 2,
    SPECIAL: 3,
  };
  const sortedRoles = [...roleData]
    .filter((r) => !isPartial || roleTypeIds!.includes(r.id))
    .sort((a, b) => {
      const catA = categoryOrder[a.category] ?? 9;
      const catB = categoryOrder[b.category] ?? 9;
      if (catA !== catB) return catA - catB;
      const poolA = physData.filter((p) => p.eligibleRoleIds.has(a.id)).length;
      const poolB = physData.filter((p) => p.eligibleRoleIds.has(b.id)).length;
      if (poolA !== poolB) return poolA - poolB;
      return a.sortOrder - b.sortOrder;
    });

  const holidayDates = getHolidayDatesForYear(year);

  // Hamilton (largest-remainder) integer quotas for READING roles.
  // Scoped to the date range being generated so proportions are correct for that window.
  const readingDaysInRange = Array.from({ length: totalDaysInYear }, (_, i) => {
    const d = new Date(year, 0, 1 + i);
    if (hasDateRange && (d < rangeStart || d > rangeEnd)) return false;
    const ds = formatDate(d);
    const dw = dayOfWeek(ds);
    return !isWeekend(dw) && !holidayDates.has(ds);
  }).filter(Boolean).length;

  const hamiltonTargets: Record<string, Record<string, number>> = {};
  for (const role of roleData) {
    if (role.category !== "READING") continue;
    // Pre-sort by name so Hamilton remainder tiebreaks are alphabetical, not CUID-dependent.
    const eligible = physData
      .filter((p) => p.eligibleRoleIds.has(role.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    if (eligible.length === 0) continue;
    const quotas = hamiltonAllocate(
      eligible.map((p) => ({ id: p.id, weight: p.fteDays })),
      readingDaysInRange
    );
    hamiltonTargets[role.id] = quotas;
    remainingQuota[role.id] = { ...quotas };
  }

  // Monthly targets for READING roles — Stage B.1 of the two-stage echo allocator.
  // Uses computeMonthlyTargets() which:
  //   1. Runs Hamilton LRM per month so each month's targets sum exactly to its echo-day count.
  //   2. Reconciles per-reader annual sums to match Stage A quotas exactly.
  //   3. Enforces min-2 per reader per month where their proportion warrants it.
  // These targets replace the old soft monthly nudge with a hard cap in the scoring loop.
  for (const role of roleData) {
    if (role.category !== "READING") continue;
    const eligible = physData
      .filter((p) => p.eligibleRoleIds.has(role.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    if (eligible.length === 0) continue;

    const readerSpecs: ReaderSpec[] = eligible.map((p) => ({
      id: p.id,
      name: `${p.lastName}${p.firstName}`,
      fte: p.fteDays,
    }));

    const monthEchoDays = new Map<number, number>();
    for (let m = (startMonth ?? 1); m <= (endMonth ?? 12); m++) {
      const mDays = countReadingDaysInMonth(year, m, holidayDates);
      if (mDays > 0) monthEchoDays.set(m, mDays);
    }

    const readerAnnualQuotas = new Map(
      readerSpecs.map((r) => [r.id, hamiltonTargets[role.id]?.[r.id] ?? 0])
    );
    const stageB1Targets = computeMonthlyTargets(readerSpecs, monthEchoDays, readerAnnualQuotas);

    // Load into monthlyRemaining (same structure as before; scoring loop uses it)
    monthlyRemaining[role.id] = {};
    for (const r of readerSpecs) {
      for (const [m, target] of (stageB1Targets.get(r.id) ?? new Map())) {
        if (!monthlyRemaining[role.id][m]) monthlyRemaining[role.id][m] = {};
        monthlyRemaining[role.id][m][r.id] = target;
      }
    }
  }

  // For partial regen: if a READING role was kept entirely (not being regenerated
  // in this run), its pre-seeded assignments should reduce the remaining quota so
  // the scoring loop doesn't try to add more.
  //
  // IMPORTANT: skip this deduction for roles that ARE being regenerated (even
  // partially by date range).  Their quota is already sized to the generation
  // window (readingDaysInRange only counts dates inside [rangeStart, rangeEnd]).
  // Pre-seeded assignments for such a role are outside that window; deducting
  // them from the window-scoped quota would starve high-FTE readers and inflate
  // low-FTE ones (the "Angeja 41" bug).
  for (const role of roleData) {
    if (role.category !== "READING" || !remainingQuota[role.id]) continue;
    // Skip if this role is being regenerated in this run.
    const roleIsBeingRegenerated = !isPartial || roleTypeIds!.includes(role.id);
    if (roleIsBeingRegenerated) continue;
    for (const [physId, cnt] of Object.entries(assignmentCount[role.id] ?? {})) {
      remainingQuota[role.id][physId] = Math.max(0, (remainingQuota[role.id][physId] ?? 0) - cnt);
    }
  }

  // Seeded random — used as a tiebreaker in non-READING scoring, and for
  // date-order shuffling inside assignEchoDates.
  let seed = year * 31337;
  function nextRandom(): number {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  // =========================================================================
  // Pre-assign READING (echo) dates using assignEchoDates.
  //
  // This runs AFTER all other assignments are pre-seeded into dailyPhysicianRoles,
  // so that rounder conflicts are already visible in isAvail.  For an echo-only
  // clean-slate run, dailyPhysicianRoles is empty and only vacations/weeklyOff
  // are checked.
  //
  // Result: echoPreAssigned maps "${dateStr}:${roleId}" → physicianId.
  // The day-by-day loop below consults this map for READING roles and bypasses
  // the scoring path entirely, falling back to annual-quota scoring only if the
  // pre-assigned reader is ruled out by a constraint that wasn't visible yet
  // (e.g., a same-day conflict created by a later assignment in the same pass).
  // =========================================================================
  const echoPreAssigned = new Map<string, string>();

  for (const role of sortedRoles) {
    if (role.category !== "READING") continue;

    const eligibleReaders = physData
      .filter((p) => p.eligibleRoleIds.has(role.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    if (eligibleReaders.length === 0) continue;

    const readerSpecs2: ReaderSpec[] = eligibleReaders.map((p) => ({
      id: p.id,
      name: `${p.lastName}${p.firstName}`,
      fte: p.fteDays,
    }));

    // Build month → available echo dates for the generation range
    const availableDates2 = new Map<number, string[]>();
    for (let m = (startMonth ?? 1); m <= (endMonth ?? 12); m++) {
      const monthDates: string[] = [];
      const cur = new Date(year, m - 1, 1);
      while (cur.getMonth() === m - 1) {
        const ds = formatDate(cur);
        const dw = dayOfWeek(ds);
        if (!isWeekend(dw) && !holidayDates.has(ds)) {
          if (!hasDateRange || (cur >= rangeStart && cur <= rangeEnd)) {
            monthDates.push(ds);
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (monthDates.length > 0) availableDates2.set(m, monthDates);
    }

    // Availability: vacation, weekly day-off, and any already-assigned rounder conflicts
    const isAvail2 = (physId: string, ds: string): boolean => {
      if (vacationDays.get(physId)?.has(ds)) return false;
      // No study reading for MDs only working a half day (READING-only gate).
      if (halfDayDays.get(physId)?.has(ds)) return false;
      const dw = dayOfWeek(ds);
      if (weeklyDayOffMap.get(physId)?.has(dw)) return false;
      const todayRoles = dailyPhysicianRoles.get(`${ds}:${physId}`);
      if (todayRoles) {
        for (const rid of todayRoles) {
          const rr = roleData.find((r) => r.id === rid);
          if (rr?.name === "HOSPITAL_ROUNDER" || rr?.name === "ICU_ROUNDER" || rr?.name === "HOSPITAL_FLOAT") return false;
        }
      }
      return true;
    };

    // Monthly targets (from monthlyRemaining which was set by computeMonthlyTargets above)
    const monthlyTargets2 = new Map<string, Map<number, number>>();
    for (const r of readerSpecs2) {
      const mmap = new Map<number, number>();
      for (const [m, readers] of Object.entries(monthlyRemaining[role.id] ?? {})) {
        const target = (readers as Record<string, number>)[r.id] ?? 0;
        if (target > 0) mmap.set(Number(m), target);
      }
      monthlyTargets2.set(r.id, mmap);
    }

    const dateAssignments2 = assignEchoDates(
      readerSpecs2,
      monthlyTargets2,
      availableDates2,
      isAvail2,
      nextRandom,
    );

    for (const [ds, physId] of dateAssignments2) {
      echoPreAssigned.set(`${ds}:${role.id}`, physId);
      // CRITICAL: also seed the reservation into dailyPhysicianRoles so the
      // DAYTIME selection (rounders, float) processed later in the day loop
      // sees that this physician is already promised to echo today and won't
      // overwrite the reservation via fallback. Without this, an echo reader
      // can be silently bumped to rounder on their reserved day, starving the
      // FTE-balanced echo distribution.
      const dprKey = `${ds}:${physId}`;
      if (!dailyPhysicianRoles.has(dprKey)) dailyPhysicianRoles.set(dprKey, new Set());
      dailyPhysicianRoles.get(dprKey)!.add(role.id);
    }
  }

  // Parse rules
  const exclusionRules = rules.filter((r) => r.ruleType === "EXCLUSION");
  const prerequisiteRules = rules.filter((r) => r.ruleType === "PREREQUISITE");
  const conflictRules = rules.filter((r) => r.ruleType === "CONFLICT");

  const icCouplingRule = prerequisiteRules.find(
    (r) => (r.parameters as Record<string, unknown>).coupleWithGeneralCall === true
  );
  const interventionalCallRole = roleData.find((r) => r.name === "INTERVENTIONAL_CALL");
  const generalCallRole = roleData.find((r) => r.name === "GENERAL_CALL");

  if (icCouplingRule && interventionalCallRole && generalCallRole) {
    const icIdx = sortedRoles.findIndex((r) => r.name === "INTERVENTIONAL_CALL");
    const gcIdx = sortedRoles.findIndex((r) => r.name === "GENERAL_CALL");
    if (icIdx !== -1 && gcIdx !== -1 && icIdx < gcIdx) {
      const [ic] = sortedRoles.splice(icIdx, 1);
      const newGcIdx = sortedRoles.findIndex((r) => r.name === "GENERAL_CALL");
      sortedRoles.splice(newGcIdx + 1, 0, ic);
    }
  }

  const preferredPhysicianRules = prerequisiteRules.filter(
    (r) => (r.parameters as Record<string, unknown>).preferredPhysician === true && r.physicianId
  );

  const preferredDayRules = prerequisiteRules.filter(
    (r) => (r.parameters as Record<string, unknown>).preferredDayOfWeek != null && r.physicianId
  );

  const firstDayIdx = hasDateRange
    ? Math.round((rangeStart.getTime() - new Date(year, 0, 1).getTime()) / 86400000)
    : 0;
  const lastDayIdx = hasDateRange
    ? Math.round((rangeEnd.getTime() - new Date(year, 0, 1).getTime()) / 86400000)
    : totalDaysInYear - 1;

  // Iterate each day in the target range
  for (let dayIdx = firstDayIdx; dayIdx <= lastDayIdx; dayIdx++) {
    const date = new Date(year, 0, 1 + dayIdx);
    const dateStr = formatDate(date);
    const dow = dayOfWeek(dateStr);
    const weekend = isWeekend(dow);
    const holidayName = holidayDates.get(dateStr);

    for (const role of sortedRoles) {
      // Determine if role needs filling today
      const needsFilling = (() => {
        if (role.category === "ON_CALL") return true; // every day
        // DAYTIME roles: weekdays only, skip weekends AND holidays
        // (no hospital/ICU rounders on weekends or holidays)
        if (role.category === "DAYTIME") {
          return !weekend && !holidayName;
        }
        if (role.category === "READING") return !weekend && !holidayName;
        if (role.category === "SPECIAL") return !weekend;
        return !weekend;
      })();

      if (!needsFilling) continue;

      // Skip roles already assigned via IC coupling
      if (handledRoleDays.has(`${dateStr}:${role.id}`)) continue;

      // Weekend call is a 3-day block (Fri-Sat-Sun) covered by a single MD.
      // On Saturday (dow=6) or Sunday (dow=7), reuse the Friday assignment.
      if (role.category === "ON_CALL" && (dow === 6 || dow === 7)) {
        // Find the Friday of this weekend
        const friday = new Date(date);
        friday.setDate(friday.getDate() - (dow === 6 ? 1 : 2));
        const fridayStr = formatDate(friday);
        const blockKey = `${fridayStr}:${role.id}`;
        const fridayPhysId = weekendCallBlocks.get(blockKey);

        if (fridayPhysId) {
          // Assign the same physician as Friday
          assignments.push({ date: dateStr, roleTypeId: role.id, physicianId: fridayPhysId });

          // Update tracking
          assignmentCount[role.id][fridayPhysId] = (assignmentCount[role.id][fridayPhysId] ?? 0) + 1;
          const todayKey = `${dateStr}:${fridayPhysId}`;
          if (!dailyPhysicianRoles.has(todayKey)) dailyPhysicianRoles.set(todayKey, new Set());
          dailyPhysicianRoles.get(todayKey)!.add(role.id);
          if (!lastAssigned[fridayPhysId]) lastAssigned[fridayPhysId] = {};
          lastAssigned[fridayPhysId][role.id] = dateStr;

          stats.totalAssignments++;
          stats.byPhysician[fridayPhysId] = (stats.byPhysician[fridayPhysId] ?? 0) + 1;

          if (holidayName) {
            if (!stats.holidays[holidayName]) stats.holidays[holidayName] = {};
            stats.holidays[holidayName][role.id] = fridayPhysId;
            const w = holidayWeights[holidayName] ?? 1;
            holidayBurden.set(fridayPhysId, (holidayBurden.get(fridayPhysId) ?? 0) + w);
          }
          continue; // Skip the normal scoring — we've already assigned this
        }
      }

      // Weekly rounder blocks: Hospital/ICU rounders are assigned Mon-Fri,
      // same MD all week. On Tue-Fri (dow 2-5), reuse Monday's assignment.
      if ((role.name === "HOSPITAL_ROUNDER" || role.name === "ICU_ROUNDER") && dow >= 2 && dow <= 5) {
        // Find the Monday of this week
        const monday = new Date(date);
        monday.setDate(monday.getDate() - (dow - 1));
        const mondayStr = formatDate(monday);
        const blockKey = `${mondayStr}:${role.id}`;
        const mondayPhysId = weeklyRounderBlocks.get(blockKey);

        if (mondayPhysId) {
          // Check if Monday's physician is on vacation this day — if so, fall through to normal scoring
          if (!vacationDays.get(mondayPhysId)?.has(dateStr)) {
            assignments.push({ date: dateStr, roleTypeId: role.id, physicianId: mondayPhysId });

            // Update tracking
            assignmentCount[role.id][mondayPhysId] = (assignmentCount[role.id][mondayPhysId] ?? 0) + 1;
            const todayKey = `${dateStr}:${mondayPhysId}`;
            if (!dailyPhysicianRoles.has(todayKey)) dailyPhysicianRoles.set(todayKey, new Set());
            dailyPhysicianRoles.get(todayKey)!.add(role.id);
            if (!lastAssigned[mondayPhysId]) lastAssigned[mondayPhysId] = {};
            lastAssigned[mondayPhysId][role.id] = dateStr;

            stats.totalAssignments++;
            stats.byPhysician[mondayPhysId] = (stats.byPhysician[mondayPhysId] ?? 0) + 1;

            if (holidayName) {
              if (!stats.holidays[holidayName]) stats.holidays[holidayName] = {};
              stats.holidays[holidayName][role.id] = mondayPhysId;
              const w = holidayWeights[holidayName] ?? 1;
              holidayBurden.set(mondayPhysId, (holidayBurden.get(mondayPhysId) ?? 0) + w);
            }
            continue; // Skip normal scoring — reused Monday's assignment
          }
        }
      }

      // Find eligible candidates
      const eligible = physData.filter((p) => {
        if (!p.eligibleRoleIds.has(role.id)) return false;
        if (vacationDays.get(p.id)?.has(dateStr)) return false;
        // No study reading for MDs only working a half day
        if (role.category === "READING" && halfDayDays.get(p.id)?.has(dateStr)) return false;
        // No-call days block ON_CALL roles only (physician still available for daytime/reading)
        if (role.category === "ON_CALL" && noCallDaySet.get(p.id)?.has(dateStr)) return false;
        // Weekly recurring day off blocks all roles on that day of week
        if (weeklyDayOffMap.get(p.id)?.has(dow)) return false;

        // Prerequisite rules
        for (const rule of prerequisiteRules) {
          if (rule.roleTypeId !== role.id) continue;
          const params = rule.parameters as Record<string, unknown>;
          if (params.requireOfficeDay && !p.officeDays.includes(dow)) return false;
        }

        // Exclusion rules
        for (const rule of exclusionRules) {
          if (rule.roleTypeId !== role.id) continue;
          const params = rule.parameters as Record<string, unknown>;
          if (params.excludeSubspecialty === "isInterventionalist" && p.isInterventionalist) return false;
          if (params.requireSubspecialty === "isInterventionalist" && !p.isInterventionalist) return false;
          if (params.requireSubspecialty === "isEP" && !p.isEP) return false;
        }

        // Conflict rules (no back-to-back call)
        for (const rule of conflictRules) {
          const params = rule.parameters as Record<string, unknown>;
          if (params.noConsecutiveCallDays) {
            const cats = (params.callCategories as string[]) ?? ["ON_CALL"];
            if (cats.includes(role.category)) {
              const yesterday = new Date(date);
              yesterday.setDate(yesterday.getDate() - 1);
              const yKey = `${formatDate(yesterday)}:${p.id}`;
              const yRoles = dailyPhysicianRoles.get(yKey);
              if (yRoles) {
                for (const rid of yRoles) {
                  // Only block if physician had the SAME role yesterday
                  // (e.g., EP_CALL on Mon doesn't block General Call on Tue)
                  if (rid === role.id) return false;
                }
              }
            }
          }

          // No consecutive weekend call — if physician was on call last weekend
          // (Fri-Sat-Sun block), exclude from this weekend's call assignments.
          // Weekend call is now a 3-day block anchored on Friday (dow=5).
          if (params.noConsecutiveWeekendCall && (dow === 5 || weekend)) {
            const cats = (params.callCategories as string[]) ?? ["ON_CALL"];
            if (cats.includes(role.category)) {
              // Find previous Friday (7 days before this weekend's Friday)
              const thisFri = new Date(date);
              if (dow === 6) thisFri.setDate(thisFri.getDate() - 1);
              else if (dow === 7) thisFri.setDate(thisFri.getDate() - 2);
              // thisFri is now the Friday of this weekend
              const prevFri = new Date(thisFri);
              prevFri.setDate(prevFri.getDate() - 7);
              const prevSat = new Date(prevFri);
              prevSat.setDate(prevSat.getDate() + 1);
              const prevSun = new Date(prevSat);
              prevSun.setDate(prevSun.getDate() + 1);

              for (const prevDate of [prevFri, prevSat, prevSun]) {
                const prevKey = `${formatDate(prevDate)}:${p.id}`;
                const prevRoles = dailyPhysicianRoles.get(prevKey);
                if (prevRoles) {
                  for (const rid of prevRoles) {
                    // Only block if physician had the SAME role last weekend
                    if (rid === role.id) return false;
                  }
                }
              }
            }
          }
        }

        // Same-day conflicts
        const todayKey = `${dateStr}:${p.id}`;
        const todayRoles = dailyPhysicianRoles.get(todayKey);
        if (todayRoles) {
          // Max 1 ON_CALL role per physician per day
          // Exception: IC coupling allows General Call + Interventional Call together
          if (role.category === "ON_CALL") {
            for (const rid of todayRoles) {
              const rr = roleData.find((r) => r.id === rid);
              if (rr?.category === "ON_CALL") {
                if (icCouplingRule) {
                  const isICGeneralPair =
                    (role.name === "INTERVENTIONAL_CALL" && rr.name === "GENERAL_CALL") ||
                    (role.name === "GENERAL_CALL" && rr.name === "INTERVENTIONAL_CALL");
                  if (isICGeneralPair) continue; // Allow this specific pairing
                }
                return false;
              }
            }
          }
          // Max 1 DAYTIME role per physician per day, AND DAYTIME excludes
          // any reader pre-reservation (echoPreAssigned was seeded into
          // dailyPhysicianRoles above). Symmetric counterpart to the
          // READING-vs-rounder exclusion below.
          if (role.category === "DAYTIME") {
            for (const rid of todayRoles) {
              const rr = roleData.find((r) => r.id === rid);
              if (rr?.category === "DAYTIME" || rr?.category === "READING") return false;
            }
          }
          // READING: skip if physician is Hospital/ICU rounder today (not in office)
          if (role.category === "READING") {
            for (const rid of todayRoles) {
              const rr = roleData.find((r) => r.id === rid);
              if (rr?.name === "HOSPITAL_ROUNDER" || rr?.name === "ICU_ROUNDER" || rr?.name === "HOSPITAL_FLOAT") return false;
            }
          }
        }

        return true;
      });

      if (eligible.length === 0) {
        stats.unfilledSlots.push({ date: dateStr, roleName: role.displayName });
        continue;
      }

      // -----------------------------------------------------------------------
      // Pick winner.
      //
      // READING roles: use the pre-computed echoPreAssigned map (Stage B.2).
      //   The map was built by assignEchoDates() which satisfies exact monthly
      //   targets from Stage B.1 while respecting vacation / weekly-off.
      //   If the pre-assigned reader is not in `eligible` (rounder conflict added
      //   later), fall back to highest annual-remaining → alphabetical.
      //
      // ON_CALL / DAYTIME / SPECIAL: equity-based scoring with seeded-random
      //   tiebreaker (unchanged).
      // -----------------------------------------------------------------------
      let winner: PhysicianData;

      if (role.category === "READING") {
        const prePhysId = echoPreAssigned.get(`${dateStr}:${role.id}`);
        const prePhys = prePhysId ? eligible.find((p) => p.id === prePhysId) : undefined;
        if (prePhys) {
          winner = prePhys;
        } else {
          // Fallback: pre-assigned reader unavailable (rounder conflict or no pre-assignment).
          // Pick the reader with the most annual remaining; alphabetical tiebreak.
          winner = eligible.reduce((best, p) => {
            const rem = remainingQuota[role.id]?.[p.id] ?? 0;
            const bestRem = remainingQuota[role.id]?.[best.id] ?? 0;
            if (rem !== bestRem) return rem > bestRem ? p : best;
            const cmp = p.lastName.localeCompare(best.lastName) || p.firstName.localeCompare(best.firstName);
            return cmp < 0 ? p : best;
          });
        }
      } else {
        const scored = eligible.map((p) => {
          let score = 0;

          // Preferred physician rule: strongly favor this physician for linked roles
          const prefRule = preferredPhysicianRules.find((r) => r.roleTypeId === role.id);
          if (prefRule && prefRule.physicianId === p.id) {
            score -= 100000; // Overwhelming preference — always picked when available
          }

          // Preferred day-of-week rule: favor physician on their preferred day
          const dayPrefRule = preferredDayRules.find(
            (r) => r.roleTypeId === role.id && r.physicianId === p.id
          );
          if (dayPrefRule) {
            const prefDay = (dayPrefRule.parameters as Record<string, unknown>).preferredDayOfWeek as number;
            if (dow === prefDay) {
              score -= 50000; // Strong day preference — picked on this day when available
            }
          }

          // Physician-level preferred task day: soft bonus for DAYTIME roles
          if (
            role.category === "DAYTIME" &&
            p.preferredTaskDay != null &&
            dow === p.preferredTaskDay
          ) {
            score -= 800;
          }

          // ON_CALL equalization: track weekday and weekend separately
          if (role.category === "ON_CALL" && dow === 5) {
            const wkendCnt = weekendBlockCount[role.id]?.[p.id] ?? 0;
            score += wkendCnt * 500;
          } else if (role.category === "ON_CALL" && dow >= 1 && dow <= 4) {
            const wkdayCnt = weekdayCallCount[role.id]?.[p.id] ?? 0;
            score += wkdayCnt * 500;
          }

          // Assignment count equity
          const cnt = assignmentCount[role.id]?.[p.id] ?? 0;
          if (role.category !== "ON_CALL") {
            score += cnt * 100;
          } else {
            score += cnt * 10;
          }

          // Daily load (prefer physicians with fewer roles today)
          const todayKey = `${dateStr}:${p.id}`;
          const todayCount = dailyPhysicianRoles.get(todayKey)?.size ?? 0;
          score += todayCount * 30;

          // Holiday equity
          if (holidayName) {
            const burden = holidayBurden.get(p.id) ?? 0;
            score += burden * 200;
          }

          // Spread out assignments (prefer longer gap since last assignment of this role)
          const last = lastAssigned[p.id]?.[role.id];
          if (last) {
            const gap = dayIdx - getDayIndex(last, year);
            score -= gap * 3;
          }

          // Small seeded-random tiebreaker
          const rnd = nextRandom() * 0.5;
          score += rnd;

          return { physician: p, score };
        });

        scored.sort((a, b) => a.score - b.score);
        winner = scored[0].physician;
      }

      // Record assignment
      assignments.push({
        date: dateStr,
        roleTypeId: role.id,
        physicianId: winner.id,
      });

      // If Friday ON_CALL, store in weekend block map for Sat/Sun reuse
      // and increment weekend block count for equalization tracking
      if (role.category === "ON_CALL" && dow === 5) {
        weekendCallBlocks.set(`${dateStr}:${role.id}`, winner.id);
        weekendBlockCount[role.id][winner.id] = (weekendBlockCount[role.id][winner.id] ?? 0) + 1;
      }

      // Track weekday call count separately (Mon-Thu) for independent equalization
      if (role.category === "ON_CALL" && dow >= 1 && dow <= 4) {
        weekdayCallCount[role.id][winner.id] = (weekdayCallCount[role.id][winner.id] ?? 0) + 1;
      }

      // If Monday rounder, store in weekly block map for Tue-Fri reuse
      if ((role.name === "HOSPITAL_ROUNDER" || role.name === "ICU_ROUNDER") && dow === 1) {
        weeklyRounderBlocks.set(`${dateStr}:${role.id}`, winner.id);
      }

      // Update tracking
      assignmentCount[role.id][winner.id] = (assignmentCount[role.id][winner.id] ?? 0) + 1;

      // Decrement remaining quota for READING roles (annual and monthly)
      if (role.category === "READING" && remainingQuota[role.id] !== undefined) {
        remainingQuota[role.id][winner.id] = (remainingQuota[role.id][winner.id] ?? 0) - 1;
        const assignMonth = date.getMonth() + 1;
        if (monthlyRemaining[role.id]?.[assignMonth] !== undefined) {
          monthlyRemaining[role.id][assignMonth][winner.id] =
            (monthlyRemaining[role.id][assignMonth][winner.id] ?? 0) - 1;
        }
      }

      const todayKey = `${dateStr}:${winner.id}`;
      if (!dailyPhysicianRoles.has(todayKey)) dailyPhysicianRoles.set(todayKey, new Set());
      dailyPhysicianRoles.get(todayKey)!.add(role.id);

      if (!lastAssigned[winner.id]) lastAssigned[winner.id] = {};
      lastAssigned[winner.id][role.id] = dateStr;

      stats.totalAssignments++;
      stats.byPhysician[winner.id] = (stats.byPhysician[winner.id] ?? 0) + 1;

      if (holidayName) {
        if (!stats.holidays[holidayName]) stats.holidays[holidayName] = {};
        stats.holidays[holidayName][role.id] = winner.id;
        const w = holidayWeights[holidayName] ?? 1;
        holidayBurden.set(winner.id, (holidayBurden.get(winner.id) ?? 0) + w);
      }

      // IC Coupling: when General Call is assigned to an interventionalist,
      // also assign them Interventional Call for the same day
      if (
        icCouplingRule &&
        role.name === "GENERAL_CALL" &&
        interventionalCallRole &&
        winner.isInterventionalist
      ) {
        const icRoleId = interventionalCallRole.id;

        // Assign IC
        assignments.push({
          date: dateStr,
          roleTypeId: icRoleId,
          physicianId: winner.id,
        });

        // Update tracking for IC
        assignmentCount[icRoleId][winner.id] = (assignmentCount[icRoleId][winner.id] ?? 0) + 1;
        const icKey = `${dateStr}:${winner.id}`;
        if (!dailyPhysicianRoles.has(icKey)) dailyPhysicianRoles.set(icKey, new Set());
        dailyPhysicianRoles.get(icKey)!.add(icRoleId);
        if (!lastAssigned[winner.id]) lastAssigned[winner.id] = {};
        lastAssigned[winner.id][icRoleId] = dateStr;

        stats.totalAssignments++;
        stats.byPhysician[winner.id] = (stats.byPhysician[winner.id] ?? 0) + 1;

        // Mark IC as handled so normal loop skips it
        handledRoleDays.add(`${dateStr}:${icRoleId}`);

        // If Friday, store IC weekend block for Sat/Sun reuse
        if (dow === 5) {
          weekendCallBlocks.set(`${dateStr}:${icRoleId}`, winner.id);
        }

        if (holidayName) {
          if (!stats.holidays[holidayName]) stats.holidays[holidayName] = {};
          stats.holidays[holidayName][icRoleId] = winner.id;
          const hw = holidayWeights[holidayName] ?? 1;
          holidayBurden.set(winner.id, (holidayBurden.get(winner.id) ?? 0) + hw);
        }
      }
    }
  }

  // Save to database — reuse existing schedule row for scoped regeneration
  const schedule =
    (isPartial || hasDateRange) && existing
      ? existing
      : await prisma.schedule.create({
          data: { year, status: "DRAFT", generatedAt: new Date() },
        });

  // Batch insert assignments
  const chunkSize = 500;
  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    await prisma.scheduleAssignment.createMany({
      data: chunk.map((a) => ({
        scheduleId: schedule.id,
        date: parseDate(a.date),
        physicianId: a.physicianId,
        roleTypeId: a.roleTypeId,
        source: "AUTO" as const,
      })),
    });
  }

  // Save holiday assignments
  for (const [hName, rolePhysMap] of Object.entries(stats.holidays)) {
    const hId = holidayIdMap[hName];
    if (!hId) continue;
    for (const [roleTypeId, physicianId] of Object.entries(rolePhysMap)) {
      await prisma.holidayAssignment.upsert({
        where: {
          holidayId_year_roleTypeId: { holidayId: hId, year, roleTypeId },
        },
        update: { physicianId },
        create: { holidayId: hId, physicianId, roleTypeId, year },
      });
    }
  }

  stats.byRole = assignmentCount;

  return { scheduleId: schedule.id, stats, assignmentCount: assignments.length };
}

function getDayIndex(dateStr: string, year: number): number {
  const d = parseDate(dateStr);
  const jan1 = new Date(year, 0, 1);
  return Math.floor((d.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24));
}
