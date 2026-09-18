"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BRIGHT_STARS,
  DEFAULT_LOCATION,
  PLANETS,
  degrees,
  moonPhase,
  moonPosition,
  nextSunEvent,
  planetPosition,
  starPosition,
  sunPosition,
  type HorizontalPos,
} from "@/lib/celestial";
import { describeWeatherCode, type CurrentWeather, type WeatherKind } from "@/lib/weather";

/*
 * The login-screen sky. Everything in it is where it really is right now over
 * San Francisco: the sun and moon (with phase), ~80 bright stars, and the five
 * naked-eye planets. Colour comes from the true solar altitude, so it drifts
 * through dawn, day, dusk and night on its own. Weather (Open-Meteo, via
 * /api/weather) adds drifting cloud, rain, snow or fog.
 *
 * Projection: a 360° panorama, south in the centre, north at both edges,
 * altitude linear from the horizon line up to the zenith at the top.
 *
 * Debug: ?sky=night|dawn|day|golden|dusk and ?wx=clear|clouds|overcast|fog|rain|snow|storm
 */

const RAD = Math.PI / 180;

// Sky palette keyed by solar altitude (degrees): [zenith, mid-sky, horizon].
// Deliberately low-saturation so the glass card stays legible at any hour.
const PALETTE: [number, [string, string, string]][] = [
  [-18, ["#070b17", "#0d1324", "#151c30"]],
  [-12, ["#0b1122", "#141d36", "#25304e"]],
  [-6,  ["#1a2a52", "#3c4d7f", "#8c7e8e"]],
  [-2,  ["#33487a", "#7288b3", "#d9a986"]],
  [0,   ["#4a6aa0", "#8fa6cc", "#ecc19a"]],
  [5,   ["#6f95c9", "#a9c0e2", "#f1d7b8"]],
  [15,  ["#8fb4e2", "#bcd3ef", "#e9eff6"]],
  [35,  ["#a6c6ec", "#cfe0f5", "#eef3f9"]],
];

const SKY_OVERRIDES: Record<string, { sun: [number, number]; moon: [number, number] }> = {
  night:  { sun: [0, -40],  moon: [210, 38] },
  dawn:   { sun: [90, -4],  moon: [255, 16] },
  day:    { sun: [180, 62], moon: [100, -10] },
  golden: { sun: [265, 7],  moon: [120, -5] },
  dusk:   { sun: [280, -5], moon: [150, 25] },
};

const PLANET_COLOR: Record<string, string> = {
  Mercury: "#d9d4c7", Venus: "#fff6dc", Mars: "#e8a077", Jupiter: "#f3e6c8", Saturn: "#eedfb4",
};

// ── small colour helpers ─────────────────────────────────────────────────────
/** Parse "#rrggbb" or "rgb(r,g,b)" into a triplet (mix() output feeds back into mix()). */
function toRgb(c: string): [number, number, number] {
  if (c.startsWith("#")) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
}
function mix(a: string, b: string, t: number): string {
  const A = toRgb(a), B = toRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function rgba(c: string, alpha: number): string {
  const [r, g, b] = toRgb(c);
  return `rgba(${r},${g},${b},${alpha})`;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function paletteFor(sunAltDeg: number): [string, string, string] {
  if (sunAltDeg <= PALETTE[0][0]) return PALETTE[0][1];
  for (let i = 1; i < PALETTE.length; i++) {
    const [a, pa] = PALETTE[i - 1];
    const [b, pb] = PALETTE[i];
    if (sunAltDeg <= b) {
      const t = (sunAltDeg - a) / (b - a);
      return [mix(pa[0], pb[0], t), mix(pa[1], pb[1], t), mix(pa[2], pb[2], t)] as unknown as [string, string, string];
    }
  }
  return PALETTE[PALETTE.length - 1][1];
}

// Deterministic pseudo-random for stable cloud/rain layouts across frames.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Cloud { x: number; y: number; scale: number; speed: number; puffs: { dx: number; dy: number; r: number }[] }
interface Drop { x: number; y: number; len: number; speed: number }

export function LivingSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const skyOverride = searchParams.get("sky");
  const wxOverride = searchParams.get("wx") as WeatherKind | null;

  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [caption, setCaption] = useState<{ text: string; dark: boolean }>({ text: "", dark: false });

  // Fetch current conditions now and every 10 minutes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) return;
        const data = (await res.json()) as CurrentWeather | { available: false };
        if (!cancelled && "temperatureF" in data) setWeather(data);
      } catch {
        /* sky still renders without weather */
      }
    }
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { lat, lon } = DEFAULT_LOCATION;

    // Weather → what to draw.
    const kind: WeatherKind = wxOverride ?? (weather ? describeWeatherCode(weather.weatherCode).kind : "clear");
    const cloudCover = wxOverride
      ? ({ clear: 5, clouds: 45, overcast: 95, fog: 70, rain: 90, snow: 90, storm: 100 } as Record<string, number>)[wxOverride] ?? 20
      : clamp(weather?.cloudCover ?? 0, 0, 100);
    const windMph = weather?.windMph ?? 6;
    const hasPrecip = kind === "rain" || kind === "snow" || kind === "storm";
    const animated = !reduceMotion && (hasPrecip || cloudCover > 15 || kind === "fog");

    let W = 0, H = 0, dpr = 1;
    let clouds: Cloud[] = [];
    let drops: Drop[] = [];

    function layout() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`; canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rnd = mulberry32(7);
      const n = Math.round((cloudCover / 100) * 9);
      clouds = Array.from({ length: n }, () => ({
        x: rnd() * W,
        y: H * (0.08 + rnd() * 0.42),
        scale: 0.7 + rnd() * 0.9,
        speed: (3 + windMph * 0.5) * (0.6 + rnd() * 0.8),
        puffs: Array.from({ length: 4 + Math.floor(rnd() * 3) }, () => ({
          dx: (rnd() - 0.5) * 140, dy: (rnd() - 0.5) * 30, r: 35 + rnd() * 45,
        })),
      }));
      const rd = mulberry32(11);
      const count = kind === "snow" ? 90 : kind === "storm" ? 220 : 150;
      drops = hasPrecip
        ? Array.from({ length: count }, () => ({ x: rd() * W, y: rd() * H, len: 8 + rd() * 10, speed: kind === "snow" ? 25 + rd() * 25 : 420 + rd() * 220 }))
        : [];
    }

    const horizonY = () => H * 0.72;
    const skyXY = (p: HorizontalPos) => {
      const azDeg = ((degrees(p.az) % 360) + 360) % 360;
      const x = W * (((azDeg + 180) % 360) / 360);
      const y = horizonY() - (clamp(degrees(p.alt), 0, 90) / 90) * (horizonY() - H * 0.04);
      return { x, y };
    };

    function positions(now: Date) {
      if (skyOverride && SKY_OVERRIDES[skyOverride]) {
        const o = SKY_OVERRIDES[skyOverride];
        return {
          sun: { az: o.sun[0] * RAD, alt: o.sun[1] * RAD },
          moon: { az: o.moon[0] * RAD, alt: o.moon[1] * RAD },
          // Shift the star clock so the demo sky still has stars/planets in plausible places.
          starTime: now,
        };
      }
      return { sun: sunPosition(now, lat, lon), moon: moonPosition(now, lat, lon), starTime: now };
    }

    let last = performance.now();
    let flashUntil = 0;
    let nextFlash = performance.now() + 6000 + Math.random() * 8000;

    function draw(t: number) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const now = new Date();
      const { sun, moon, starTime } = positions(now);
      const sunAlt = degrees(sun.alt);
      const [top, mid, hor] = paletteFor(sunAlt);
      const darkness = clamp(-sunAlt / 12, 0, 1);            // 0 by day → 1 past nautical dusk
      const clearness = 1 - (cloudCover / 100) * 0.9 - (kind === "fog" ? 0.5 : 0);
      const c = ctx!;

      // Sky
      const g = c.createLinearGradient(0, 0, 0, horizonY());
      g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, hor);
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      // Warm glow at the sun's azimuth around sunrise/sunset
      if (sunAlt > -12 && sunAlt < 12) {
        const p = skyXY({ az: sun.az, alt: 0 });
        const strength = (1 - Math.abs(sunAlt) / 12) * 0.55 * clamp(clearness + 0.3, 0, 1);
        const rg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, W * 0.45);
        rg.addColorStop(0, `rgba(255,190,130,${strength})`);
        rg.addColorStop(0.5, `rgba(255,170,120,${strength * 0.25})`);
        rg.addColorStop(1, "rgba(255,170,120,0)");
        c.fillStyle = rg; c.fillRect(0, 0, W, H);
      }

      // Stars
      const starAlpha = darkness * clamp(clearness, 0, 1);
      if (starAlpha > 0.02) {
        for (const s of BRIGHT_STARS) {
          const pos = starPosition(s, starTime, lat, lon);
          if (pos.alt <= 0) continue;
          const { x, y } = skyXY(pos);
          const r = clamp(2.3 - s.mag * 0.45, 0.6, 2.4);
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
          c.fillStyle = `rgba(235,240,255,${starAlpha * clamp(1.05 - s.mag * 0.2, 0.35, 1)})`;
          c.fill();
        }
        // Planets: slightly larger, tinted, labelled
        c.font = "500 10px Inter, system-ui, sans-serif";
        c.textAlign = "left";
        for (const name of PLANETS) {
          const pos = planetPosition(name, starTime, lat, lon);
          if (pos.alt <= 0) continue;
          const { x, y } = skyXY(pos);
          const r = clamp(2.6 - pos.mag * 0.35, 1.6, 4);
          const col = PLANET_COLOR[name];
          const glow = c.createRadialGradient(x, y, 0, x, y, r * 4);
          glow.addColorStop(0, rgba(col, starAlpha * 0.5)); glow.addColorStop(1, rgba(col, 0));
          c.fillStyle = glow; c.beginPath(); c.arc(x, y, r * 4, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = rgba(col, starAlpha); c.fill();
          c.fillStyle = `rgba(230,235,250,${starAlpha * 0.55})`;
          c.fillText(name, x + r + 4, y + 3);
        }
      }

      // Sun
      if (sunAlt > -1.5) {
        const p = skyXY({ az: sun.az, alt: Math.max(sun.alt, 0) });
        const warmth = clamp(1 - sunAlt / 20, 0, 1);                    // orange low, pale high
        const core = mix("#fff6e0", "#ffb35c", warmth);
        const dim = clamp(clearness + 0.15, 0.15, 1);
        const halo = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 160);
        halo.addColorStop(0, `rgba(255,240,210,${0.45 * dim})`);
        halo.addColorStop(0.3, `rgba(255,220,170,${0.12 * dim})`);
        halo.addColorStop(1, "rgba(255,220,170,0)");
        c.fillStyle = halo; c.beginPath(); c.arc(p.x, p.y, 160, 0, Math.PI * 2); c.fill();
        c.globalAlpha = dim;
        c.beginPath(); c.arc(p.x, p.y, 14, 0, Math.PI * 2); c.fillStyle = core; c.fill();
        c.globalAlpha = 1;
      }

      // Moon with phase
      if (moon.alt > 0) {
        const p = skyXY(moon);
        const r = 11;
        const phase = moonPhase(now);
        const presence = clamp(0.35 + darkness * 0.65, 0, 1) * clamp(clearness + 0.1, 0.1, 1);
        const lit = `rgba(246,243,232,${presence})`;
        const shadow = `rgba(${darkness > 0.5 ? "22,28,46" : "140,160,190"},${presence * (darkness > 0.5 ? 0.92 : 0.35)})`;
        if (darkness > 0.3) {
          const mg = c.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 5);
          mg.addColorStop(0, `rgba(240,240,255,${0.18 * presence})`); mg.addColorStop(1, "rgba(240,240,255,0)");
          c.fillStyle = mg; c.beginPath(); c.arc(p.x, p.y, r * 5, 0, Math.PI * 2); c.fill();
        }
        c.save();
        c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.clip();
        c.fillStyle = lit; c.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
        const tcos = Math.cos(2 * Math.PI * phase);          // 1 new → -1 full
        const waxing = phase < 0.5;                          // lit on the right (northern hemisphere)
        c.fillStyle = shadow;
        c.beginPath();
        c.arc(p.x, p.y, r, waxing ? Math.PI / 2 : -Math.PI / 2, waxing ? (3 * Math.PI) / 2 : Math.PI / 2);
        c.fill();
        c.fillStyle = tcos > 0 ? shadow : lit;
        c.beginPath(); c.ellipse(p.x, p.y, Math.abs(tcos) * r, r, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }

      // Clouds
      const cloudTone = darkness > 0.5 ? mix("#1e2640", "#323b58", 0.5) : mix("#ffffff", hor, 0.25);
      const cloudAlpha = (darkness > 0.5 ? 0.38 : 0.55) + (cloudCover / 100) * 0.3;
      for (const cl of clouds) {
        if (animated) { cl.x += cl.speed * dt; if (cl.x > W + 200) cl.x = -200; }
        for (const pf of cl.puffs) {
          const x = cl.x + pf.dx * cl.scale, y = cl.y + pf.dy * cl.scale, r = pf.r * cl.scale;
          const cg = c.createRadialGradient(x, y, 0, x, y, r);
          cg.addColorStop(0, rgba(cloudTone, cloudAlpha));
          cg.addColorStop(1, rgba(cloudTone, 0));
          c.fillStyle = cg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        }
      }

      // Fog: a haze band that thickens toward the horizon
      if (kind === "fog") {
        const fg = c.createLinearGradient(0, H * 0.25, 0, H);
        fg.addColorStop(0, "rgba(220,225,232,0)");
        fg.addColorStop(0.6, `rgba(215,220,230,${darkness > 0.5 ? 0.35 : 0.6})`);
        fg.addColorStop(1, `rgba(205,210,222,${darkness > 0.5 ? 0.5 : 0.75})`);
        c.fillStyle = fg; c.fillRect(0, 0, W, H);
      }

      // Ground: a soft dark band so the horizon reads
      const ground = c.createLinearGradient(0, horizonY(), 0, H);
      ground.addColorStop(0, darkness > 0.5 ? "rgba(10,14,26,0.55)" : "rgba(40,55,80,0.10)");
      ground.addColorStop(1, darkness > 0.5 ? "rgba(6,9,18,0.9)" : "rgba(30,45,70,0.30)");
      c.fillStyle = ground; c.fillRect(0, horizonY(), W, H - horizonY());

      // Precipitation
      if (hasPrecip) {
        const windX = clamp(windMph, 0, 30) * 0.12;
        if (kind === "snow") {
          c.fillStyle = `rgba(255,255,255,${0.75 * (0.5 + darkness * 0.5)})`;
          for (const d of drops) {
            if (animated) { d.y += d.speed * dt; d.x += Math.sin(t / 900 + d.len) * 12 * dt + windX * 8 * dt; if (d.y > H) { d.y = -5; d.x = Math.random() * W; } }
            c.beginPath(); c.arc(d.x, d.y, d.len / 7, 0, Math.PI * 2); c.fill();
          }
        } else {
          c.strokeStyle = `rgba(200,215,240,${darkness > 0.5 ? 0.35 : 0.5})`;
          c.lineWidth = 1;
          for (const d of drops) {
            if (animated) { d.y += d.speed * dt; d.x += windX * 40 * dt; if (d.y > H) { d.y = -20; d.x = Math.random() * W; } }
            c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x - windX * 2, d.y - d.len); c.stroke();
          }
        }
        if (kind === "storm" && animated) {
          if (t > nextFlash) { flashUntil = t + 90; nextFlash = t + 7000 + Math.random() * 12000; }
          if (t < flashUntil) { c.fillStyle = "rgba(255,255,255,0.07)"; c.fillRect(0, 0, W, H); }
        }
      }

      setCaptionSafe(now, darkness);
    }

    let lastCaption = "";
    function setCaptionSafe(now: Date, darkness: number) {
      const parts: string[] = [DEFAULT_LOCATION.name];
      if (weather) {
        const { label } = describeWeatherCode(weather.weatherCode);
        parts.push(`${Math.round(weather.temperatureF)}°F`, wxOverride ? wxOverride : label);
        if (weather.windMph >= 8) parts.push(`wind ${Math.round(weather.windMph)} mph`);
      }
      const ev = nextSunEvent(now, lat, lon);
      if (ev) {
        const time = ev.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: DEFAULT_LOCATION.timeZone });
        parts.push(`${ev.kind === "sunrise" ? "sunrise" : "sunset"} ${time}`);
      }
      const text = parts.join(" · ");
      const dark = darkness > 0.45;
      const key = `${text}|${dark}`;
      if (key !== lastCaption) { lastCaption = key; setCaption({ text, dark }); }
    }

    layout();
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (animated) {
      const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    } else {
      draw(performance.now());
      timer = setInterval(() => draw(performance.now()), 60_000);
    }
    const onResize = () => { layout(); if (!animated) draw(performance.now()); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [weather, skyOverride, wxOverride]);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />
      {caption.text && (
        <p
          className={`pointer-events-none fixed inset-x-0 bottom-4 z-0 px-4 text-center text-[12px] tracking-wide ${caption.dark ? "text-white/70" : "text-slate-800/60"}`}
          aria-live="polite"
        >
          {caption.text}
        </p>
      )}
    </>
  );
}
