import { NextResponse } from "next/server";
import { DEFAULT_LOCATION } from "@/lib/celestial";
import type { CurrentWeather } from "@/lib/weather";

// Public, unauthenticated: current conditions for the login-screen sky.
// Open-Meteo needs no API key. Cached for 10 minutes so a busy login page
// makes one upstream call, not one per visitor.
export const revalidate = 600;

export async function GET() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(DEFAULT_LOCATION.lat));
  url.searchParams.set("longitude", String(DEFAULT_LOCATION.lon));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,cloud_cover,precipitation,is_day");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = (await res.json()) as {
      current: {
        time: string;
        temperature_2m: number;
        weather_code: number;
        wind_speed_10m: number;
        cloud_cover: number;
        precipitation: number;
        is_day: number;
      };
    };
    const c = data.current;
    const body: CurrentWeather = {
      temperatureF: c.temperature_2m,
      weatherCode: c.weather_code,
      windMph: c.wind_speed_10m,
      cloudCover: c.cloud_cover,
      precipitation: c.precipitation,
      isDay: c.is_day === 1,
      observedAt: c.time,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" },
    });
  } catch (err) {
    // Not an error for the visitor: the sky simply renders without weather.
    console.warn("weather fetch failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ available: false }, { headers: { "Cache-Control": "public, s-maxage=120" } });
  }
}
