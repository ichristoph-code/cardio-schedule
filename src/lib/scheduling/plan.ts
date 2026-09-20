import { createHash } from "node:crypto";
import { z } from "zod";
import { calculateSchedule } from "@/lib/scheduler";
import type { ScheduleData } from "./data";

export const scopeSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  roleTypeIds: z.array(z.string().min(1)).min(1).optional(),
  startMonth: z.number().int().min(1).max(12).default(1),
  endMonth: z.number().int().min(1).max(12).default(12),
  resetOnly: z.boolean().default(false),
}).refine((s) => s.startMonth <= s.endMonth, { message: "Start month must not follow end month" })
  .refine((s) => !s.resetOnly || !!s.roleTypeIds?.length, { message: "Select roles to reset" });
export type ScheduleScope = z.infer<typeof scopeSchema>;
export type PlannedAssignment = { date: string; roleTypeId: string; physicianId: string };

// Normalize unordered query results as well as dates before comparing snapshots.
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function dateRange(scope: ScheduleScope) {
  return { gte: new Date(Date.UTC(scope.year, scope.startMonth - 1, 1)), lte: new Date(Date.UTC(scope.year, scope.endMonth, 0)) };
}
export function affectedAssignments(data: ScheduleData, scope: ScheduleScope) {
  const range = dateRange(scope);
  const floatId = data.roleTypes.find((r) => r.name === "HOSPITAL_FLOAT")?.id;
  return data.savedAssignments.filter((a) => a.date >= range.gte && a.date <= range.lte &&
    (!scope.roleTypeIds || scope.roleTypeIds.includes(a.roleTypeId)) &&
    (scope.resetOnly || !(a.source === "MANUAL" && a.roleTypeId === floatId)));
}

export function makePlan(data: ScheduleData, scope: ScheduleScope) {
  if (scope.roleTypeIds?.some((id) => !data.roleTypes.some((r) => r.id === id))) throw new Error("A selected role no longer exists");
  if (scope.resetOnly && !data.existing) throw new Error("No schedule exists for that year");
  const affected = affectedAssignments(data, scope);
  const removedIds = new Set(affected.map((a) => a.id));
  const kept = data.savedAssignments.filter((a) => !removedIds.has(a.id));
  const generated = scope.resetOnly ? { assignments: [] as PlannedAssignment[], stats: { unfilledSlots: [] as { date: string; roleName: string }[] } }
    : calculateSchedule(data, scope.year, scope.roleTypeIds, scope.startMonth, scope.endMonth);
  const final = [...kept.filter((a) => a.isActive).map((a) => ({ ...a, date: a.date.toISOString().slice(0, 10) })), ...generated.assignments];
  const conflicts: { date: string; physician: string; role: string; reason: string }[] = [];
  for (const a of final) {
    const p = data.physicians.find((p) => p.id === a.physicianId);
    const role = data.roleTypes.find((r) => r.id === a.roleTypeId);
    if (!p || !role) continue;
    const date = new Date(`${a.date}T00:00:00Z`);
    const reasons: string[] = [];
    if (!p.eligibilities.some((e) => e.roleTypeId === role.id)) reasons.push("Not eligible for this duty");
    if (data.vacations.some((v) => v.physicianId === p.id && v.startDate <= date && v.endDate >= date && (v.halfDay === "NONE" || role.category === "READING"))) reasons.push("Vacation overlaps duty");
    if (data.weeklyDaysOffRecords.some((w) => w.physicianId === p.id && w.dayOfWeek === date.getUTCDay())) reasons.push("Recurring day off");
    if (role.category === "ON_CALL" && data.noCallDays.some((n) => n.physicianId === p.id && n.date.getTime() === date.getTime())) reasons.push("Approved no-call day");
    for (const reason of reasons) conflicts.push({ date: a.date, physician: `${p.firstName} ${p.lastName}`, role: role.displayName, reason });
  }
  const distribution = data.physicians.map((p) => ({
    physician: `${p.firstName} ${p.lastName}`,
    total: final.filter((a) => a.physicianId === p.id).length,
    roles: data.roleTypes.map((r) => ({ role: r.displayName, count: final.filter((a) => a.physicianId === p.id && a.roleTypeId === r.id).length })).filter((r) => r.count > 0),
  }));
  return {
    scope, assignments: generated.assignments, fingerprint: fingerprint(data),
    summary: { replacedCount: affected.length, manualCount: affected.filter((a) => a.source === "MANUAL").length,
      addedCount: generated.assignments.length, retainedCount: kept.length,
      unfilledSlots: generated.stats.unfilledSlots, conflicts, distribution },
  };
}
export type SchedulePlan = ReturnType<typeof makePlan>;
export type SchedulePreview = { previewId: string; scope: ScheduleScope; summary: SchedulePlan["summary"] };
