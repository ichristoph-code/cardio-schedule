import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), assignments: vi.fn(), schedules: vi.fn(), holidays: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  scheduleAssignment: { findMany: mocks.assignments },
  schedule: { findMany: mocks.schedules },
  customHoliday: { findMany: mocks.holidays },
} }));

const read = (start = "2027-12-20", end = "2028-01-20") => GET(new Request(`http://localhost/api/schedules/timeline?start=${start}&end=${end}`));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
  mocks.assignments.mockResolvedValue([]);
  mocks.schedules.mockResolvedValue([]);
  mocks.holidays.mockResolvedValue([]);
});

describe("admin schedule timeline", () => {
  it("requires an authenticated admin before reading any data", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await read()).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { role: "PHYSICIAN" } });
    expect((await read()).status).toBe(403);
    expect(mocks.assignments).not.toHaveBeenCalled();
  });

  it.each([
    ["2027-02-29", "2027-03-02"], ["2027-13-01", "2028-01-01"],
    ["2028-01-02", "2028-01-01"], ["2027-01-01", "2028-01-01"], ["bad", "2027-01-01"],
  ])("rejects invalid or oversized ranges: %s through %s", async (start, end) => {
    expect((await read(start, end)).status).toBe(400);
    expect(mocks.assignments).not.toHaveBeenCalled();
  });

  it("loads both sides of year-end and keeps the owning schedule for edits", async () => {
    mocks.schedules.mockResolvedValue([{ id: "next-year", year: 2028, status: "DRAFT" }]);
    mocks.assignments.mockResolvedValue([{
      id: "new-year-duty", scheduleId: "next-year", date: new Date("2028-01-01T00:00:00Z"), source: "MANUAL",
      physician: { id: "p1", firstName: "Test", lastName: "Doctor" },
      roleType: { id: "call", name: "GENERAL_CALL", displayName: "General Call", category: "ON_CALL", sortOrder: 1 },
    }]);
    mocks.holidays.mockResolvedValue([{ date: new Date("2027-12-31T00:00:00Z"), name: "Removed holiday", hidden: true }]);
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      assignments: [{ id: "new-year-duty", scheduleId: "next-year", date: "2028-01-01", physicianName: "Test Doctor" }],
      schedules: [{ year: 2028, status: "DRAFT" }],
      customHolidays: [{ date: "2027-12-31", hidden: true }],
    });
    expect(mocks.assignments.mock.calls[0][0].where).toEqual({ isActive: true, date: {
      gte: new Date("2027-12-20T00:00:00Z"), lte: new Date("2028-01-20T00:00:00Z"),
    } });
    expect(mocks.schedules.mock.calls[0][0].where).toEqual({ year: { gte: 2027, lte: 2028 } });
  });

  it("returns empty dates without inventing a schedule", async () => {
    const response = await read("2035-01-01", "2035-04-30");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assignments: [], schedules: [], customHolidays: [] });
  });

  it("reports a read failure instead of presenting an empty schedule", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.assignments.mockRejectedValueOnce(new Error("Database unavailable"));
    expect((await read()).status).toBe(500);
    log.mockRestore();
  });
});
