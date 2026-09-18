import { describe, it, expect } from "vitest";
import { describeWeatherCode } from "./weather";

describe("describeWeatherCode", () => {
  it("maps the common WMO codes", () => {
    expect(describeWeatherCode(0)).toEqual({ kind: "clear", label: "Clear" });
    expect(describeWeatherCode(2).kind).toBe("clouds");
    expect(describeWeatherCode(3).kind).toBe("overcast");
    expect(describeWeatherCode(45).kind).toBe("fog");
    expect(describeWeatherCode(53).kind).toBe("rain");
    expect(describeWeatherCode(65).label).toBe("Heavy rain");
    expect(describeWeatherCode(73).kind).toBe("snow");
    expect(describeWeatherCode(81).label).toBe("Showers");
    expect(describeWeatherCode(96).kind).toBe("storm");
  });
  it("falls back to cloudy for unknown codes", () => {
    expect(describeWeatherCode(42).kind).toBe("clouds");
  });
});
