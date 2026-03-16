import { prisma } from "./prisma";

// --- Date Helpers ---

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
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

// --- Main Engine ---

export async function generateSchedule(year: number): Promise<{
  scheduleId: string;
  stats: ScheduleStats;
  assignmentCount: number;
}> {
  // Check for existing schedule
  const existing = await prisma.schedule.findUnique({ where: { year } });
  if (existing) {
    // Delete old schedule and its assignments
    await prisma.holidayAssignment.deleteMany({ where: { year } });
    await prisma.scheduleAssignment.deleteMany({
      where: { scheduleId: existing.id },
    });
    await prisma.schedule.delete({ where: { id: existing.id } });
  }

  // Load data
  const physicians = await prisma.physician.findMany({
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
  for (const v of vacations) {
    const dates = vacationDays.get(v.physicianId) ?? new Set<string>();
    const s = new Date(Math.max(v.startDate.getTime(), yearStart.getTime()));
    const e = new Date(Math.min(v.endDate.getTime(), yearEnd.getTime()));
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      dates.add(formatDate(d));
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
    dates.add(formatDate(nc.date));
    noCallDaySet.set(nc.physicianId, dates);
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
  }));

  const roleData: RoleData[] = roleTypes.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.displayName,
    category: r.category,
    sortOrder: r.sortOrder,
  }));

  // Sort roles: most constrained first (fewest eligible physicians),
  // then by category priority (ON_CALL > DAYTIME > READING > SPECIAL)
  const categoryOrder: Record<string, number> = {
    ON_CALL: 0,
    DAYTIME: 1,
    READING: 2,
    SPECIAL: 3,
  };
  const sortedRoles = [...roleData].sort((a, b) => {
    const poolA = physData.filter((p) => p.eligibleRoleIds.has(a.id)).length;
    const poolB = physData.filter((p) => p.eligibleRoleIds.has(b.id)).length;
    if (poolA !== poolB) return poolA - poolB;
    return (categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9);
  });

  const holidayDates = getHolidayDatesForYear(year);

  // Parse rules
  const exclusionRules = rules.filter((r) => r.ruleType === "EXCLUSION");
  const prerequisiteRules = rules.filter((r) => r.ruleType === "PREREQUISITE");
  const conflictRules = rules.filter((r) => r.ruleType === "CONFLICT");

  // IC coupling rule: when interventionalist gets General Call, also gets IC
  const icCouplingRule = prerequisiteRules.find(
    (r) => (r.parameters as Record<string, unknown>).coupleWithGeneralCall === true
  );
  const interventionalCallRole = roleData.find((r) => r.name === "INTERVENTIONAL_CALL");
  const generalCallRole = roleData.find((r) => r.name === "GENERAL_CALL");

  // When IC coupling is active, reorder so IC is processed right after General Call
  // (normally IC comes first since fewer eligible physicians = higher priority)
  if (icCouplingRule && interventionalCallRole && generalCallRole) {
    const icIdx = sortedRoles.findIndex((r) => r.name === "INTERVENTIONAL_CALL");
    const gcIdx = sortedRoles.findIndex((r) => r.name === "GENERAL_CALL");
    if (icIdx !== -1 && gcIdx !== -1 && icIdx < gcIdx) {
      const [ic] = sortedRoles.splice(icIdx, 1);
      const newGcIdx = sortedRoles.findIndex((r) => r.name === "GENERAL_CALL");
      sortedRoles.splice(newGcIdx + 1, 0, ic);
    }
  }

  // Preferred physician rules (e.g., Ginwalla for ICU Rounder)
  const preferredPhysicianRules = prerequisiteRules.filter(
    (r) => (r.parameters as Record<string, unknown>).preferredPhysician === true && r.physicianId
  );

  // Preferred day-of-week rules (e.g., Christoph reads MPI on Mondays)
  const preferredDayRules = prerequisiteRules.filter(
    (r) => (r.parameters as Record<string, unknown>).preferredDayOfWeek != null && r.physicianId
  );

  // Tracking structures
  const assignmentCount: Record<string, Record<string, number>> = {};
  const dailyPhysicianRoles = new Map<string, Set<string>>(); // "date:physId" -> roleIds
  const lastAssigned: Record<string, Record<string, string>> = {}; // physId -> roleId -> dateStr
  const handledRoleDays = new Set<string>(); // "dateStr:roleId" — roles already assigned via coupling

  for (const role of roleData) assignmentCount[role.id] = {};

  const assignments: { date: string; roleTypeId: string; physicianId: string }[] = [];
  const stats: ScheduleStats = {
    totalAssignments: 0,
    byRole: {},
    byPhysician: {},
    holidays: {},
    unfilledSlots: [],
  };

  // Track weekend call blocks: "Fri dateStr:roleId" -> physicianId
  // Weekend call is a 3-day block (Fri-Sat-Sun) covered by the same MD
  const weekendCallBlocks = new Map<string, string>();

  // Track weekend call block counts per role per physician for equalization
  // roleId -> physicianId -> count (so each ON_CALL role equalizes independently)
  const weekendBlockCount: Record<string, Record<string, number>> = {};
  for (const role of roleData) weekendBlockCount[role.id] = {};

  // Track weekday call counts separately per role per physician for independent equalization
  // roleId -> physicianId -> count of weekday-only (Mon-Thu) call assignments
  const weekdayCallCount: Record<string, Record<string, number>> = {};
  for (const role of roleData) weekdayCallCount[role.id] = {};

  // Track weekly rounder blocks: "Mon dateStr:roleId" -> physicianId
  // Hospital/ICU rounders are assigned Mon-Fri as a week-long block (same MD)
  const weeklyRounderBlocks = new Map<string, string>();

  // --- FTE-proportional allocation for READING roles ---
  // Pre-compute each eligible physician's FTE share per reading role.
  // If a role has 3 eligible MDs with FTE 200, 200, and 100, their shares
  // are 0.4, 0.4, 0.2 — so the half-time doc gets ~half the days.
  // fteShareByRole: roleId -> physId -> proportional share (0-1, sums to 1)
  const fteShareByRole: Record<string, Record<string, number>> = {};
  // Monthly assignment tracking for READING roles: "roleId:month" -> physId -> count
  const monthlyReadingCount: Record<string, Record<string, number>> = {};

  for (const role of roleData) {
    if (role.category !== "READING") continue;

    const eligiblePhys = physData.filter((p) => p.eligibleRoleIds.has(role.id));
    const totalFte = eligiblePhys.reduce((sum, p) => sum + p.fteDays, 0);

    if (totalFte > 0) {
      fteShareByRole[role.id] = {};
      for (const p of eligiblePhys) {
        fteShareByRole[role.id][p.id] = p.fteDays / totalFte;
      }
    }
  }

  // Seeded random for deterministic tiebreaking
  let seed = year * 31337;
  function nextRandom(): number {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  // Iterate each day
  const totalDays = isLeapYear(year) ? 366 : 365;

  for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
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
        // No-call days block ON_CALL roles only (physician still available for daytime/reading)
        if (role.category === "ON_CALL" && noCallDaySet.get(p.id)?.has(dateStr)) return false;

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
          // Max 1 DAYTIME role per physician per day
          if (role.category === "DAYTIME") {
            for (const rid of todayRoles) {
              const rr = roleData.find((r) => r.id === rid);
              if (rr?.category === "DAYTIME") return false;
            }
          }
          // READING: skip if physician is Hospital/ICU rounder today (not in office)
          if (role.category === "READING") {
            for (const rid of todayRoles) {
              const rr = roleData.find((r) => r.id === rid);
              if (rr?.name === "HOSPITAL_ROUNDER" || rr?.name === "ICU_ROUNDER") return false;
            }
          }
        }

        return true;
      });

      if (eligible.length === 0) {
        stats.unfilledSlots.push({ date: dateStr, roleName: role.displayName });
        continue;
      }

      // Score candidates
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

        // ON_CALL equalization: track weekday and weekend separately
        // so one pool doesn't penalize the other
        if (role.category === "ON_CALL" && dow === 5) {
          // Weekend call equalization — highest priority for Fridays
          const wkendCnt = weekendBlockCount[role.id]?.[p.id] ?? 0;
          score += wkendCnt * 500;
        } else if (role.category === "ON_CALL" && dow >= 1 && dow <= 4) {
          // Weekday call equalization — equally strong for Mon-Thu
          const wkdayCnt = weekdayCallCount[role.id]?.[p.id] ?? 0;
          score += wkdayCnt * 500;
        }

        // Assignment count equity (main factor for non-ON_CALL roles)
        const cnt = assignmentCount[role.id]?.[p.id] ?? 0;
        if (role.category === "READING" && fteShareByRole[role.id]?.[p.id]) {
          // FTE-proportional equity: normalize count by physician's target share.
          // A physician with 40% share who has 10 assignments scores the same as
          // one with 20% share who has 5 — both are "on pace" relative to FTE.
          const share = fteShareByRole[role.id][p.id];
          const normalized = cnt / share; // higher = more "over quota"
          score += normalized * 100;

          // Monthly balancing: within the current month, nudge toward FTE-proportional
          // distribution so assignments spread evenly across the year, not just annually.
          const monthKey = `${role.id}:${date.getMonth()}`;
          const monthlyCnt = monthlyReadingCount[monthKey]?.[p.id] ?? 0;
          const monthlyNormalized = monthlyCnt / share;
          score += monthlyNormalized * 40; // softer weight — monthly is a nudge, yearly is precise
        } else if (role.category !== "ON_CALL") {
          score += cnt * 100;
        } else {
          // For ON_CALL, still use a lighter general equity as tiebreaker
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

        // Small deterministic tiebreaker
        score += nextRandom() * 0.5;

        return { physician: p, score };
      });

      scored.sort((a, b) => a.score - b.score);
      const winner = scored[0].physician;

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

      // Monthly reading count for FTE-proportional monthly balancing
      if (role.category === "READING") {
        const monthKey = `${role.id}:${date.getMonth()}`;
        if (!monthlyReadingCount[monthKey]) monthlyReadingCount[monthKey] = {};
        monthlyReadingCount[monthKey][winner.id] = (monthlyReadingCount[monthKey][winner.id] ?? 0) + 1;
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

  // Save to database
  const schedule = await prisma.schedule.create({
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
