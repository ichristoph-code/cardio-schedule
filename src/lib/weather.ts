// Weather model for the login-screen sky. Data comes from Open-Meteo (free,
// no key) via /api/weather; this file just interprets WMO weather codes.

export type WeatherKind = "clear" | "clouds" | "overcast" | "fog" | "rain" | "snow" | "storm";

export interface CurrentWeather {
  temperatureF: number;
  weatherCode: number;
  windMph: number;
  cloudCover: number;     // 0–100
  precipitation: number;  // inches in the last hour
  isDay: boolean;
  observedAt: string;     // ISO
}

/** WMO 4677 weather code → what to animate and what to call it. */
export function describeWeatherCode(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: "clear", label: "Clear" };
  if (code === 1) return { kind: "clear", label: "Mainly clear" };
  if (code === 2) return { kind: "clouds", label: "Partly cloudy" };
  if (code === 3) return { kind: "overcast", label: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { kind: "rain", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { kind: "rain", label: code >= 65 ? "Heavy rain" : "Rain" };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { kind: "rain", label: "Showers" };
  if (code === 85 || code === 86) return { kind: "snow", label: "Snow showers" };
  if (code >= 95) return { kind: "storm", label: "Thunderstorm" };
  return { kind: "clouds", label: "Cloudy" };
}
