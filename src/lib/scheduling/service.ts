import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAllHolidayDatesForYear } from "@/lib/holidays";
import { loadScheduleData, type ScheduleData } from "./data";
import { fingerprint, makePlan, affectedAssignments, type SchedulePlan, type ScheduleScope } from "./plan";

export class ScheduleConflict extends Error {}
const options = { isolationLevel: "Serializable" as const, timeout: 30_000, maxWait: 10_000 };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const stateOf = (data: ScheduleData) => ({ schedule: data.existing, assignments: data.savedAssignments, holidays: data.holidayAssignments });
type SavedState = ReturnType<typeof stateOf>;
type Recovery = { year: number; before: SavedState; afterFingerprint: string; label: string };

export async function previewSchedule(scope: ScheduleScope, userId: string) {
  const data = await prisma.$transaction((tx) => loadScheduleData(scope.year, tx), { ...options, isolationLevel: "RepeatableRead" });
  const plan = makePlan(data, scope);
  const preview = await prisma.auditLog.create({ data: {
    userId, action: "PREVIEW_SCHEDULE", entityType: "Schedule", entityId: String(scope.year), details: json(plan),
  } });
  return { previewId: preview.id, scope, summary: plan.summary };
}

/** Replace only after a fresh snapshot matches the reviewed preview. All writes roll back together. */
export async function applySchedule(previewId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const preview = await tx.auditLog.findUnique({ where: { id: previewId } });
    if (!preview || preview.action !== "PREVIEW_SCHEDULE" || preview.userId !== userId || !preview.details) throw new ScheduleConflict("Preview not found. Create a new preview.");
    if (Date.now() - preview.createdAt.getTime() > 15 * 60_000) throw new ScheduleConflict("This preview expired. Review a fresh preview before applying.");
    const plan = preview.details as unknown as SchedulePlan;
    const data = await loadScheduleData(plan.scope.year, tx);
    if (fingerprint(data) !== plan.fingerprint) throw new ScheduleConflict("The schedule or its inputs changed. Create a new preview to protect those edits.");
    const before = stateOf(data);
    const affected = affectedAssignments(data, plan.scope);
    const schedule = await tx.schedule.upsert({
      where: { year: plan.scope.year },
      create: { year: plan.scope.year, status: "DRAFT", generatedAt: new Date() },
      update: { status: "DRAFT", generatedAt: new Date(), publishedAt: null, publishedBy: null },
    });
    await tx.scheduleAssignment.deleteMany({ where: { scheduleId: schedule.id, id: { in: affected.map((a) => a.id) } } });
    for (let i = 0; i < plan.assignments.length; i += 500) {
      await tx.scheduleAssignment.createMany({ data: plan.assignments.slice(i, i + 500).map((a) => ({
        ...a, scheduleId: schedule.id, date: new Date(`${a.date}T00:00:00Z`), source: "AUTO" as const,
      })) });
    }
    // Rebuild holiday history from the complete resulting schedule, including retained duties.
    const assignments = await tx.scheduleAssignment.findMany({ where: { scheduleId: schedule.id } });
    const dates = getAllHolidayDatesForYear(plan.scope.year, data.customHolidayRows.map((h) => ({ ...h, date: h.date.toISOString().slice(0, 10) })));
    const holidays = new Map<string, { year: number; holidayId: string; physicianId: string; roleTypeId: string }>();
    for (const a of assignments) {
      if (!a.isActive || data.roleTypes.find((r) => r.id === a.roleTypeId)?.category !== "ON_CALL") continue;
      const holiday = data.dbHolidays.find((h) => h.name === dates.get(a.date.toISOString().slice(0, 10)));
      if (holiday) holidays.set(`${holiday.id}:${a.roleTypeId}`, { year: plan.scope.year, holidayId: holiday.id, physicianId: a.physicianId, roleTypeId: a.roleTypeId });
    }
    await tx.holidayAssignment.deleteMany({ where: { year: plan.scope.year } });
    if (holidays.size) await tx.holidayAssignment.createMany({ data: [...holidays.values()] });
    const after = stateOf(await loadScheduleData(plan.scope.year, tx));
    const recovery = await tx.auditLog.create({ data: {
      userId, action: "SCHEDULE_CHANGE", entityType: "Schedule", entityId: String(plan.scope.year),
      details: json({ year: plan.scope.year, before, afterFingerprint: fingerprint(after), label: plan.scope.resetOnly ? "Reset roles" : "Generate schedule" } satisfies Recovery),
    } });
    // Consumption belongs to the same transaction, so a failed save can be retried.
    await tx.auditLog.update({ where: { id: previewId }, data: { action: "APPLIED_SCHEDULE_PREVIEW" } });
    return { scheduleId: schedule.id, recoveryId: recovery.id, summary: plan.summary };
  }, options);
}

export async function restoreSchedule(recoveryId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.auditLog.findUnique({ where: { id: recoveryId } });
    if (!entry || entry.action !== "SCHEDULE_CHANGE" || !entry.details) throw new ScheduleConflict("Recovery point is unavailable.");
    const saved = entry.details as unknown as Recovery;
    const current = await loadScheduleData(saved.year, tx);
    if (fingerprint(stateOf(current)) !== saved.afterFingerprint) throw new ScheduleConflict("The schedule has changed since this operation. Restore is blocked to preserve newer edits.");
    const before = saved.before;
    if (current.existing) await tx.scheduleAssignment.deleteMany({ where: { scheduleId: current.existing.id } });
    await tx.holidayAssignment.deleteMany({ where: { year: saved.year } });
    if (before.schedule) {
      const s = before.schedule;
      await tx.schedule.update({ where: { id: s.id }, data: {
        status: s.status, generatedAt: s.generatedAt ? new Date(s.generatedAt) : null,
        publishedAt: s.publishedAt ? new Date(s.publishedAt) : null, publishedBy: s.publishedBy,
      } });
      for (let i = 0; i < before.assignments.length; i += 500) {
        await tx.scheduleAssignment.createMany({ data: before.assignments.slice(i, i + 500).map((a) => ({
          ...a, date: new Date(a.date), createdAt: new Date(a.createdAt), updatedAt: new Date(a.updatedAt),
        })) });
      }
      if (before.holidays.length) await tx.holidayAssignment.createMany({ data: before.holidays });
    } else if (current.existing) {
      await tx.schedule.delete({ where: { id: current.existing.id } });
    }
    await tx.auditLog.update({ where: { id: recoveryId }, data: { action: "RESTORED_SCHEDULE_CHANGE" } });
    await tx.auditLog.create({ data: { userId, action: "RESTORE_SCHEDULE", entityType: "Schedule", entityId: String(saved.year), details: json({ recoveryId, year: saved.year }) } });
    return { year: saved.year };
  }, options);
}

export async function latestRecovery(year: number) {
  const entry = await prisma.auditLog.findFirst({ where: { action: "SCHEDULE_CHANGE", entityType: "Schedule", entityId: String(year) }, orderBy: { createdAt: "desc" } });
  if (!entry?.details) return null;
  const details = entry.details as unknown as Recovery;
  const current = await prisma.$transaction((tx) => loadScheduleData(year, tx), { ...options, isolationLevel: "RepeatableRead" });
  if (fingerprint(stateOf(current)) !== details.afterFingerprint) return null;
  return { id: entry.id, label: details.label, createdAt: entry.createdAt.toISOString(), assignmentCount: details.before.assignments.length };
}
