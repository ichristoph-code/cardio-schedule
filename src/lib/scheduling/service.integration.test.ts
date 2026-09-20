import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadScheduleData } from "./data";
import { makePlan, scopeSchema, fingerprint } from "./plan";
import { previewSchedule, applySchedule, restoreSchedule, latestRecovery } from "./service";

const url = process.env.SCHEDULE_TEST_DATABASE_URL;
// Refuse to run against a practice database, even if an environment variable is misconfigured.
if (url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.pathname !== "/cardio_schedule_codex_test") throw new Error("Integration tests require the isolated local cardio_schedule_codex_test database");
  process.env.DATABASE_URL = url;
}
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const scope = (extra = {}) => scopeSchema.parse({ year: 2027, startMonth: 1, endMonth: 1, roleTypeIds: ["routine"], ...extra });
const state = async () => {
  const data = await loadScheduleData(2027);
  return { schedule: data.existing, assignments: data.savedAssignments, holidays: data.holidayAssignments };
};

describe.skipIf(!url)("complete schedule changes in isolated PostgreSQL", () => {
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_schedule_insert ON "ScheduleAssignment"');
    await prisma.auditLog.deleteMany();
    await prisma.holidayAssignment.deleteMany();
    await prisma.scheduleAssignment.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.vacationRequest.deleteMany();
    await prisma.noCallDayRequest.deleteMany();
    await prisma.physicianWeeklyDayOff.deleteMany();
    await prisma.customHoliday.deleteMany();
    await prisma.schedulingRule.deleteMany();
    await prisma.physicianEligibility.deleteMany();
    await prisma.physicianOfficeDay.deleteMany();
    await prisma.physician.deleteMany();
    await prisma.user.deleteMany();
    await prisma.roleType.deleteMany();
    await prisma.holiday.deleteMany();
    await prisma.user.create({ data: { id: "admin", email: "admin@example.test", role: "ADMIN", passwordHash: "unused-in-service-tests" } });
    for (const [id, name, category] of [["routine", "DOC_IN_BOX", "SPECIAL"], ["float", "HOSPITAL_FLOAT", "DAYTIME"], ["call", "GENERAL_CALL", "ON_CALL"]] as const) {
      await prisma.roleType.create({ data: { id, name, displayName: name, category } });
    }
    for (let i = 1; i <= 3; i++) {
      await prisma.user.create({ data: { id: `u${i}`, email: `doctor${i}@example.test`, passwordHash: "unused" } });
      await prisma.physician.create({ data: { id: `p${i}`, userId: `u${i}`, firstName: `Doctor ${i}`, lastName: "Example", eligibilities: { create: ["routine", "float", "call"].map((roleTypeId) => ({ roleTypeId })) } } });
    }
    await prisma.schedule.create({ data: { id: "schedule", year: 2027, status: "PUBLISHED", publishedAt: new Date("2026-01-01"), publishedBy: "admin" } });
    await prisma.scheduleAssignment.createMany({ data: [
      { id: "jan", scheduleId: "schedule", physicianId: "p1", roleTypeId: "routine", date: day("2027-01-04") },
      { id: "feb", scheduleId: "schedule", physicianId: "p1", roleTypeId: "routine", date: day("2027-02-01") },
      { id: "manual", scheduleId: "schedule", physicianId: "p2", roleTypeId: "float", date: day("2027-01-04"), source: "MANUAL" },
    ] });
  });
  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_schedule_insert ON "ScheduleAssignment"');
    await prisma.$disconnect();
  });

  it("previews without changing assignments and resets only the selected month", async () => {
    const original = await state();
    const preview = await previewSchedule(scope({ resetOnly: true }), "admin");
    expect(preview.summary.replacedCount).toBe(1);
    expect(fingerprint(await state())).toBe(fingerprint(original));
    const result = await applySchedule(preview.previewId, "admin");
    expect((await state()).assignments.map((a) => a.id).sort()).toEqual(["feb", "manual"]);
    expect(await latestRecovery(2027)).toMatchObject({ id: result.recoveryId });
    await restoreSchedule(result.recoveryId, "admin");
    expect(fingerprint((await state()).assignments)).toBe(fingerprint(original.assignments));
    expect((await state()).schedule?.status).toBe("PUBLISHED");
    expect((await state()).schedule?.publishedAt).toEqual(original.schedule?.publishedAt);
  });

  it("honors removed holidays during complete generation and preserves manual float", async () => {
    await prisma.customHoliday.create({ data: { date: day("2027-01-18"), name: "Martin Luther King Jr. Day", hidden: true } });
    const data = await loadScheduleData(2027);
    const plan = makePlan(data, scope({ roleTypeIds: ["routine", "float"] }));
    expect(plan.assignments.some((a) => a.date === "2027-01-18" && a.roleTypeId === "routine")).toBe(true);
    expect(plan.assignments.some((a) => a.date === "2027-01-04" && a.roleTypeId === "float")).toBe(false);
    const preview = await previewSchedule(scope({ roleTypeIds: ["routine", "float"] }), "admin");
    await applySchedule(preview.previewId, "admin");
    expect(await prisma.scheduleAssignment.findUnique({ where: { id: "manual" } })).toMatchObject({ source: "MANUAL", physicianId: "p2" });
    expect(await prisma.scheduleAssignment.findUnique({ where: { id: "feb" } })).not.toBeNull();
  });

  it("reports uncovered duties and retained availability conflicts", async () => {
    await prisma.physicianEligibility.deleteMany({ where: { roleTypeId: "routine" } });
    await prisma.vacationRequest.create({ data: { physicianId: "p2", startDate: day("2027-01-04"), endDate: day("2027-01-04"), status: "APPROVED" } });
    const preview = await previewSchedule(scope(), "admin");
    expect(preview.summary.unfilledSlots.length).toBeGreaterThan(0);
    expect(preview.summary.conflicts).toContainEqual(expect.objectContaining({ physician: "Doctor 2 Example", reason: "Vacation overlaps duty" }));
  });

  it("rolls back deletes, earlier insert batches, status and recovery if a later insert fails", async () => {
    const preview = await previewSchedule(scope({ startMonth: 1, endMonth: 12, roleTypeIds: ["routine", "float", "call"] }), "admin");
    expect(preview.summary.addedCount).toBeGreaterThan(500);
    const original = fingerprint(await state());
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_late_schedule_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.date >= DATE '2027-12-01' THEN RAISE EXCEPTION 'injected late save failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_schedule_insert BEFORE INSERT ON "ScheduleAssignment" FOR EACH ROW EXECUTE FUNCTION fail_late_schedule_insert()');
    await expect(applySchedule(preview.previewId, "admin")).rejects.toThrow();
    expect(fingerprint(await state())).toBe(original);
    expect(await prisma.auditLog.count({ where: { action: "SCHEDULE_CHANGE" } })).toBe(0);
    expect(await prisma.auditLog.findUnique({ where: { id: preview.previewId } })).toMatchObject({ action: "PREVIEW_SCHEDULE" });
  });

  it("rejects a stale preview after assignments or scheduling inputs change", async () => {
    const preview = await previewSchedule(scope(), "admin");
    await prisma.vacationRequest.create({ data: { physicianId: "p1", startDate: day("2027-01-11"), endDate: day("2027-01-11"), status: "APPROVED" } });
    const before = fingerprint(await state());
    await expect(applySchedule(preview.previewId, "admin")).rejects.toThrow("inputs changed");
    expect(fingerprint(await state())).toBe(before);
  });

  it("does not restore over newer manual edits", async () => {
    const preview = await previewSchedule(scope({ resetOnly: true }), "admin");
    const result = await applySchedule(preview.previewId, "admin");
    await prisma.scheduleAssignment.update({ where: { id: "feb" }, data: { physicianId: "p3" } });
    await expect(restoreSchedule(result.recoveryId, "admin")).rejects.toThrow("newer edits");
    expect(await latestRecovery(2027)).toBeNull();
  });

  it("allows only one of two concurrent applications of the same preview", async () => {
    const preview = await previewSchedule(scope({ resetOnly: true }), "admin");
    const results = await Promise.allSettled([applySchedule(preview.previewId, "admin"), applySchedule(preview.previewId, "admin")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "SCHEDULE_CHANGE" } })).toBe(1);
  });

  it("restores the absence of a schedule after first generation", async () => {
    await prisma.schedule.delete({ where: { id: "schedule" } });
    const preview = await previewSchedule(scope(), "admin");
    const result = await applySchedule(preview.previewId, "admin");
    expect((await state()).assignments.length).toBeGreaterThan(0);
    await restoreSchedule(result.recoveryId, "admin");
    expect((await state()).schedule).toBeNull();
    expect((await state()).assignments).toHaveLength(0);
  });
});
