import { describe, it, expect } from "vitest";
import { __schedulingHelpers } from "./scheduler";

const { roleNeedsFilling } = __schedulingHelpers;

describe("roleNeedsFilling — holidays are staffed like weekends", () => {
  const routine = ["DAYTIME", "READING", "SPECIAL", "SOMETHING_NEW"];

  it("staffs ON_CALL every day, including weekends and holidays", () => {
    expect(roleNeedsFilling("ON_CALL", false, false)).toBe(true);
    expect(roleNeedsFilling("ON_CALL", true, false)).toBe(true);
    expect(roleNeedsFilling("ON_CALL", false, true)).toBe(true);
  });

  it("staffs routine roles on ordinary weekdays only", () => {
    for (const c of routine) expect(roleNeedsFilling(c, false, false)).toBe(true);
  });

  it("skips routine roles on weekends", () => {
    for (const c of routine) expect(roleNeedsFilling(c, true, false)).toBe(false);
  });

  it("skips routine roles on holidays (incl. SPECIAL, which used to run)", () => {
    for (const c of routine) expect(roleNeedsFilling(c, false, true)).toBe(false);
  });
});
