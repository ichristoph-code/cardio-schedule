import { describe, it, expect } from "vitest";
import { sunPosition, moonPosition, moonPhase, moonIllumination, nextSunEvent, degrees, starPosition, BRIGHT_STARS, planetEcliptic } from "./celestial";

// San Francisco, 2027-06-21 (summer solstice). Published times (PDT, UTC-7):
// sunrise ≈ 05:48, solar noon ≈ 13:11, sunset ≈ 20:35.
const SF = { lat: 37.7749, lon: -122.4194 };
const pdt = (h: number, m: number) => new Date(Date.UTC(2027, 5, 21, h + 7, m));

describe("sunPosition (San Francisco, 2027-06-21)", () => {
  it("is at the horizon around sunrise and sunset", () => {
    expect(Math.abs(degrees(sunPosition(pdt(5, 48), SF.lat, SF.lon).alt))).toBeLessThan(1.0);
    expect(Math.abs(degrees(sunPosition(pdt(20, 35), SF.lat, SF.lon).alt))).toBeLessThan(1.0);
  });

  it("rises in the north-east and sets in the north-west in June", () => {
    const rise = degrees(sunPosition(pdt(5, 48), SF.lat, SF.lon).az);
    const set = degrees(sunPosition(pdt(20, 35), SF.lat, SF.lon).az);
    expect(rise).toBeGreaterThan(50);
    expect(rise).toBeLessThan(70);
    expect(set).toBeGreaterThan(290);
    expect(set).toBeLessThan(310);
  });

  it("peaks near 75° altitude due south at solar noon", () => {
    const noon = sunPosition(pdt(13, 11), SF.lat, SF.lon);
    expect(degrees(noon.alt)).toBeGreaterThan(74);
    expect(degrees(noon.alt)).toBeLessThan(77);
    expect(Math.abs(degrees(noon.az) - 180)).toBeLessThan(3);
  });

  it("is well below the horizon at midnight", () => {
    expect(degrees(sunPosition(pdt(0, 30), SF.lat, SF.lon).alt)).toBeLessThan(-25);
  });
});

describe("nextSunEvent", () => {
  it("finds the sunset from mid-afternoon and the sunrise from night", () => {
    const set = nextSunEvent(pdt(15, 0), SF.lat, SF.lon)!;
    expect(set.kind).toBe("sunset");
    expect(Math.abs(set.at.valueOf() - pdt(20, 35).valueOf())).toBeLessThan(4 * 60_000);

    const rise = nextSunEvent(pdt(1, 0), SF.lat, SF.lon)!;
    expect(rise.kind).toBe("sunrise");
    expect(Math.abs(rise.at.valueOf() - pdt(5, 48).valueOf())).toBeLessThan(4 * 60_000);
  });
});

describe("moon", () => {
  it("phase is 0 at the reference new moon and 0.5 at the following full moon", () => {
    expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBeCloseTo(0, 3);
    // Full moon 2000-01-21 04:40 UTC
    expect(Math.abs(moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40))) - 0.5)).toBeLessThan(0.02);
    expect(moonIllumination(new Date(Date.UTC(2000, 0, 21, 4, 40)))).toBeGreaterThan(0.98);
  });

  it("a full moon is opposite the sun: up at midnight, high in the south", () => {
    // Full moon near 2027-06-20 (published: 2027-06-20 ~10:44 UTC). Check local midnight after.
    const midnight = new Date(Date.UTC(2027, 5, 21, 7, 0)); // 00:00 PDT Jun 21
    const m = moonPosition(midnight, SF.lat, SF.lon);
    expect(degrees(m.alt)).toBeGreaterThan(15);
    expect(Math.abs(degrees(m.az) - 180)).toBeLessThan(60);
  });
});

describe("stars", () => {
  const star = (n: string) => BRIGHT_STARS.find((s) => s.name === n)!;

  it("Polaris sits at the latitude of the observer, due north, at any time", () => {
    for (const h of [0, 6, 12, 18]) {
      const p = starPosition(star("Polaris"), pdt(h, 0), SF.lat, SF.lon);
      expect(Math.abs(degrees(p.alt) - SF.lat)).toBeLessThan(1);
      const az = degrees(p.az);
      expect(Math.min(az, 360 - az)).toBeLessThan(1.5);
    }
  });

  it("Vega is near the zenith around 23:00 PDT in late July", () => {
    const p = starPosition(star("Vega"), new Date(Date.UTC(2027, 6, 25, 6, 0)), SF.lat, SF.lon); // 23:00 PDT Jul 24
    expect(degrees(p.alt)).toBeGreaterThan(80);
  });
});

describe("planets (opposition/conjunction dates line up with the sun)", () => {
  // At opposition a planet's ecliptic longitude is the sun's + 180°.
  const sunLon = (date: Date) => {
    // Sun's geocentric longitude = Earth's heliocentric + 180°, via Mars-style elements is overkill;
    // use the simple solar formula from sunPosition instead (mean anomaly + equation of centre).
    const d = date.valueOf() / 86_400_000 - 0.5 + 2440588 - 2451545;
    const M = (357.5291 + 0.98560028 * d) * Math.PI / 180;
    const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M)) * Math.PI / 180;
    return ((M + C + 102.9372 * Math.PI / 180 + Math.PI) * 180 / Math.PI + 720) % 360;
  };
  const diff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

  it("Jupiter opposition 2026-01-10", () => {
    const d = new Date(Date.UTC(2026, 0, 10));
    expect(diff(degrees(planetEcliptic("Jupiter", d).lon), sunLon(d) + 180)).toBeLessThan(3);
  });
  it("Saturn opposition 2025-09-21", () => {
    const d = new Date(Date.UTC(2025, 8, 21));
    expect(diff(degrees(planetEcliptic("Saturn", d).lon), sunLon(d) + 180)).toBeLessThan(3);
  });
  it("Mars opposition 2027-02-19", () => {
    const d = new Date(Date.UTC(2027, 1, 19));
    expect(diff(degrees(planetEcliptic("Mars", d).lon), sunLon(d) + 180)).toBeLessThan(3);
  });
  it("Venus superior conjunction 2026-01-06 (same longitude as the sun)", () => {
    const d = new Date(Date.UTC(2026, 0, 6));
    expect(diff(degrees(planetEcliptic("Venus", d).lon), sunLon(d))).toBeLessThan(3);
  });
});
