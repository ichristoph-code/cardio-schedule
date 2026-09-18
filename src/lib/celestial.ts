// Compact ephemeris (SunCalc-style) for the login-screen sky.
// Gives the true azimuth/altitude of the sun and moon for a location and
// time, the lunar phase, and the next sunrise/sunset. Accuracy is a few
// arc-minutes — plenty to put the sun where it actually is in the sky.

export interface HorizontalPos {
  az: number;  // radians, compass bearing: 0 = N, π/2 = E, π = S
  alt: number; // radians above the horizon (negative = below)
}

const RAD = Math.PI / 180;
const OBLIQUITY = RAD * 23.4397;
const DAY_MS = 86_400_000;

// Default location: San Francisco. Override per deployment if the practice moves.
export const DEFAULT_LOCATION = { lat: 37.7749, lon: -122.4194, name: "San Francisco", timeZone: "America/Los_Angeles" };

/** Days since J2000.0 (2000-01-01 12:00 UTC). */
function toDays(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + 2440588 - 2451545;
}
function rightAscension(l: number, b: number): number {
  return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
}
function declination(l: number, b: number): number {
  return Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
}
function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}
function toHorizontal(d: number, ra: number, dec: number, lat: number, lon: number): HorizontalPos {
  const phi = RAD * lat;
  const lw = RAD * -lon;
  const H = siderealTime(d, lw) - ra;
  return {
    az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI,
    alt: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)),
  };
}

export function sunPosition(date: Date, lat = DEFAULT_LOCATION.lat, lon = DEFAULT_LOCATION.lon): HorizontalPos {
  const d = toDays(date);
  const M = RAD * (357.5291 + 0.98560028 * d);                         // mean anomaly
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;                          // ecliptic longitude
  return toHorizontal(d, rightAscension(L, 0), declination(L, 0), lat, lon);
}

export function moonPosition(date: Date, lat = DEFAULT_LOCATION.lat, lon = DEFAULT_LOCATION.lon): HorizontalPos {
  const d = toDays(date);
  const L = RAD * (218.316 + 13.176396 * d);  // mean longitude
  const M = RAD * (134.963 + 13.064993 * d);  // mean anomaly
  const F = RAD * (93.272 + 13.22935 * d);    // mean distance
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return toHorizontal(d, rightAscension(l, b), declination(l, b), lat, lon);
}

/** Lunar phase as a fraction of the synodic month: 0 = new, 0.25 = first quarter, 0.5 = full. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853;
  const days = (date.valueOf() - Date.UTC(2000, 0, 6, 18, 14)) / DAY_MS;
  return (((days / synodic) % 1) + 1) % 1;
}

/** Fraction of the lunar disc that is lit, 0..1. */
export function moonIllumination(date: Date): number {
  return (1 - Math.cos(2 * Math.PI * moonPhase(date))) / 2;
}

/**
 * Next sunrise or sunset after `date` (first horizon crossing within 24h,
 * scanned at one-minute resolution). Returns null only at extreme latitudes.
 */
export function nextSunEvent(
  date: Date,
  lat = DEFAULT_LOCATION.lat,
  lon = DEFAULT_LOCATION.lon
): { kind: "sunrise" | "sunset"; at: Date } | null {
  // Published sunrise/sunset use the upper limb + refraction: -0.833°.
  const H0 = -0.833 * RAD;
  let prevAbove = sunPosition(date, lat, lon).alt > H0;
  for (let m = 1; m <= 24 * 60; m++) {
    const t = new Date(date.valueOf() + m * 60_000);
    const above = sunPosition(t, lat, lon).alt > H0;
    if (above !== prevAbove) return { kind: above ? "sunrise" : "sunset", at: t };
    prevAbove = above;
  }
  return null;
}

/** The local calendar day at `timeZone`, as YYYY-MM-DD (en-CA formats that way). */
function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Phrase the next sun event for the sky caption — "sunset at 7:14 PM tonight"
 * rather than a bare "sunset 7:14 PM", which reads like a clock.
 *
 * The day word is derived, not assumed: a sunset is always later the same day
 * (once it has passed, the next event is the sunrise), but a sunrise is either
 * later this morning (seen pre-dawn) or tomorrow's (seen after dark).
 */
export function describeSunEvent(
  now: Date,
  event: { kind: "sunrise" | "sunset"; at: Date },
  timeZone: string = DEFAULT_LOCATION.timeZone,
): string {
  const time = event.at.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  if (event.kind === "sunset") return `sunset at ${time} tonight`;
  const sameDay = localDay(now, timeZone) === localDay(event.at, timeZone);
  return `sunrise at ${time} ${sameDay ? "this morning" : "tomorrow"}`;
}

export const degrees = (rad: number) => rad / RAD;

// ── Bright stars (J2000 RA/Dec in degrees, visual magnitude) ────────────────
// The ~80 brightest stars visible from mid-northern latitudes, enough to draw
// the recognisable shapes: Orion, the Big Dipper, Cassiopeia, the Summer
// Triangle, Scorpius, Leo, Gemini, Taurus.
export interface Star { name: string; ra: number; dec: number; mag: number }
export const BRIGHT_STARS: Star[] = [
  { name: "Sirius", ra: 101.287, dec: -16.716, mag: -1.46 },
  { name: "Arcturus", ra: 213.915, dec: 19.182, mag: -0.05 },
  { name: "Vega", ra: 279.235, dec: 38.784, mag: 0.03 },
  { name: "Capella", ra: 79.172, dec: 45.998, mag: 0.08 },
  { name: "Rigel", ra: 78.634, dec: -8.202, mag: 0.13 },
  { name: "Procyon", ra: 114.826, dec: 5.225, mag: 0.34 },
  { name: "Betelgeuse", ra: 88.793, dec: 7.407, mag: 0.42 },
  { name: "Altair", ra: 297.696, dec: 8.868, mag: 0.77 },
  { name: "Aldebaran", ra: 68.98, dec: 16.509, mag: 0.85 },
  { name: "Spica", ra: 201.298, dec: -11.161, mag: 0.97 },
  { name: "Antares", ra: 247.352, dec: -26.432, mag: 1.06 },
  { name: "Pollux", ra: 116.329, dec: 28.026, mag: 1.14 },
  { name: "Fomalhaut", ra: 344.413, dec: -29.622, mag: 1.16 },
  { name: "Deneb", ra: 310.358, dec: 45.28, mag: 1.25 },
  { name: "Regulus", ra: 152.093, dec: 11.967, mag: 1.35 },
  { name: "Adhara", ra: 104.656, dec: -28.972, mag: 1.5 },
  { name: "Castor", ra: 113.65, dec: 31.888, mag: 1.58 },
  { name: "Shaula", ra: 263.402, dec: -37.104, mag: 1.62 },
  { name: "Bellatrix", ra: 81.283, dec: 6.35, mag: 1.64 },
  { name: "Elnath", ra: 81.573, dec: 28.607, mag: 1.65 },
  { name: "Alnilam", ra: 84.053, dec: -1.202, mag: 1.69 },
  { name: "Alnitak", ra: 85.19, dec: -1.943, mag: 1.74 },
  { name: "Alioth", ra: 193.507, dec: 55.96, mag: 1.77 },
  { name: "Dubhe", ra: 165.932, dec: 61.751, mag: 1.79 },
  { name: "Mirfak", ra: 51.081, dec: 49.861, mag: 1.8 },
  { name: "Wezen", ra: 107.098, dec: -26.393, mag: 1.83 },
  { name: "Kaus Australis", ra: 276.043, dec: -34.385, mag: 1.85 },
  { name: "Alkaid", ra: 206.885, dec: 49.313, mag: 1.86 },
  { name: "Menkalinan", ra: 89.882, dec: 44.947, mag: 1.9 },
  { name: "Alhena", ra: 99.428, dec: 16.399, mag: 1.93 },
  { name: "Mirzam", ra: 95.675, dec: -17.956, mag: 1.98 },
  { name: "Polaris", ra: 37.955, dec: 89.264, mag: 1.98 },
  { name: "Alphard", ra: 141.897, dec: -8.659, mag: 2.0 },
  { name: "Hamal", ra: 31.793, dec: 23.462, mag: 2.0 },
  { name: "Algieba", ra: 154.993, dec: 19.842, mag: 2.0 },
  { name: "Diphda", ra: 10.897, dec: -17.987, mag: 2.0 },
  { name: "Nunki", ra: 283.816, dec: -26.297, mag: 2.05 },
  { name: "Mirach", ra: 17.433, dec: 35.621, mag: 2.05 },
  { name: "Alpheratz", ra: 2.097, dec: 29.09, mag: 2.06 },
  { name: "Saiph", ra: 86.939, dec: -9.67, mag: 2.06 },
  { name: "Kochab", ra: 222.676, dec: 74.156, mag: 2.08 },
  { name: "Rasalhague", ra: 263.734, dec: 12.56, mag: 2.08 },
  { name: "Algol", ra: 47.042, dec: 40.956, mag: 2.1 },
  { name: "Almach", ra: 30.975, dec: 42.33, mag: 2.1 },
  { name: "Denebola", ra: 177.265, dec: 14.572, mag: 2.14 },
  { name: "Sadr", ra: 305.557, dec: 40.257, mag: 2.2 },
  { name: "Alphecca", ra: 233.672, dec: 26.715, mag: 2.23 },
  { name: "Schedar", ra: 10.127, dec: 56.537, mag: 2.24 },
  { name: "Eltanin", ra: 269.152, dec: 51.489, mag: 2.24 },
  { name: "Mintaka", ra: 83.002, dec: -0.299, mag: 2.25 },
  { name: "Mizar", ra: 200.981, dec: 54.925, mag: 2.27 },
  { name: "Caph", ra: 2.295, dec: 59.15, mag: 2.28 },
  { name: "Dschubba", ra: 240.083, dec: -22.622, mag: 2.29 },
  { name: "Merak", ra: 165.46, dec: 56.382, mag: 2.37 },
  { name: "Izar", ra: 221.247, dec: 27.074, mag: 2.37 },
  { name: "Enif", ra: 326.046, dec: 9.875, mag: 2.4 },
  { name: "Scheat", ra: 345.944, dec: 28.083, mag: 2.42 },
  { name: "Sabik", ra: 257.595, dec: -15.725, mag: 2.43 },
  { name: "Phecda", ra: 178.458, dec: 53.695, mag: 2.44 },
  { name: "Gamma Cas", ra: 14.177, dec: 60.717, mag: 2.47 },
  { name: "Markab", ra: 346.19, dec: 15.205, mag: 2.49 },
  { name: "Menkar", ra: 45.57, dec: 4.09, mag: 2.5 },
  { name: "Zosma", ra: 168.527, dec: 20.524, mag: 2.56 },
  { name: "Arneb", ra: 83.183, dec: -17.822, mag: 2.58 },
  { name: "Unukalhai", ra: 236.067, dec: 6.426, mag: 2.6 },
  { name: "Graffias", ra: 241.359, dec: -19.805, mag: 2.62 },
  { name: "Ruchbah", ra: 21.454, dec: 60.235, mag: 2.68 },
  { name: "Muphrid", ra: 208.671, dec: 18.398, mag: 2.68 },
  { name: "Zubenelgenubi", ra: 222.72, dec: -16.042, mag: 2.75 },
  { name: "Rastaban", ra: 262.608, dec: 52.301, mag: 2.79 },
  { name: "Vindemiatrix", ra: 195.544, dec: 10.959, mag: 2.83 },
  { name: "Alcyone", ra: 56.871, dec: 24.105, mag: 2.87 },
  { name: "Albireo", ra: 292.68, dec: 27.96, mag: 3.1 },
  { name: "Megrez", ra: 183.857, dec: 57.033, mag: 3.31 },
  { name: "Segin", ra: 28.599, dec: 63.67, mag: 3.38 },
  { name: "Thuban", ra: 211.097, dec: 64.376, mag: 3.65 },
];

/** Where a fixed star is in the sky right now (equatorial → horizontal). */
export function starPosition(star: Star, date: Date, lat = DEFAULT_LOCATION.lat, lon = DEFAULT_LOCATION.lon): HorizontalPos {
  return toHorizontal(toDays(date), star.ra * RAD, star.dec * RAD, lat, lon);
}

// ── Naked-eye planets: JPL approximate Keplerian elements (valid 1800–2050) ──
// [a (AU), e, I (deg), L (deg), ϖ (deg), Ω (deg)] at J2000 and per-century rates.
type Elements = [number, number, number, number, number, number];
const PLANET_ELEMENTS: Record<string, { e0: Elements; rate: Elements; mag: number }> = {
  Mercury: { e0: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], mag: 0.0 },
  Venus:   { e0: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], mag: -4.0 },
  Earth:   { e0: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0], mag: 0 },
  Mars:    { e0: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], mag: -0.5 },
  Jupiter: { e0: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], mag: -2.2 },
  Saturn:  { e0: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], mag: 0.6 },
};
export const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;
export type PlanetName = (typeof PLANETS)[number];

/** Heliocentric ecliptic rectangular coordinates (AU). */
function heliocentric(name: string, T: number): [number, number, number] {
  const { e0, rate } = PLANET_ELEMENTS[name];
  const [a, e, I, L, w̄, Ω] = e0.map((v, i) => v + rate[i] * T);
  const M = ((((L - w̄) % 360) + 540) % 360) - 180;
  const ω = (w̄ - Ω) * RAD;
  let E = M * RAD + e * Math.sin(M * RAD);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M * RAD) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(ω), sw = Math.sin(ω), cO = Math.cos(Ω * RAD), sO = Math.sin(Ω * RAD), ci = Math.cos(I * RAD), si = Math.sin(I * RAD);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

/** Geocentric ecliptic longitude/latitude (radians) of a planet. */
export function planetEcliptic(name: PlanetName, date: Date): { lon: number; lat: number; distance: number } {
  const T = toDays(date) / 36525;
  const [px, py, pz] = heliocentric(name, T);
  const [ex, ey, ez] = heliocentric("Earth", T);
  const x = px - ex, y = py - ey, z = pz - ez;
  const distance = Math.sqrt(x * x + y * y + z * z);
  return { lon: ((Math.atan2(y, x) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), lat: Math.asin(z / distance), distance };
}

export function planetPosition(name: PlanetName, date: Date, lat = DEFAULT_LOCATION.lat, lon = DEFAULT_LOCATION.lon): HorizontalPos & { mag: number } {
  const ecl = planetEcliptic(name, date);
  const pos = toHorizontal(toDays(date), rightAscension(ecl.lon, ecl.lat), declination(ecl.lon, ecl.lat), lat, lon);
  return { ...pos, mag: PLANET_ELEMENTS[name].mag };
}
