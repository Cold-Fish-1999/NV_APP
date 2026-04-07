/**
 * Weather API — proxied through Next.js server to avoid iOS SSL issues.
 */

import { Platform } from "react-native";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function getApiBase(): string {
  return API_BASE;
}

function guessTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Asia/Shanghai";
  }
}

export interface HourlyWeather {
  hour: number;
  temp: number;
  weatherCode: number;
}

export interface DayWeather {
  date: string;
  hourly: HourlyWeather[];
  tempMin: number;
  tempMax: number;
  weatherCode: number;
  city: string;
}

/** WMO weather code to label */
export function weatherCodeToLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Showers";
  if (code <= 94) return "Thunderstorm";
  return "Unknown";
}

export async function fetchDayWeather(
  dateStr: string,
  coords?: { latitude: number; longitude: number } | null,
): Promise<DayWeather | null> {
  const lat = coords?.latitude ?? 39.9;
  const lon = coords?.longitude ?? 116.4;
  const tz = guessTz();
  const base = getApiBase();
  const url = `${base}/api/weather?date=${dateStr}&lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[weather] proxy HTTP", res.status);
      return null;
    }
    const data = (await res.json()) as {
      hourly?: { time?: string[]; temperature_2m?: number[]; weathercode?: number[] };
      city?: string;
      error?: string;
    };
    if (data.error || !data.hourly?.time) {
      console.warn("[weather] proxy response:", data.error ?? "no hourly data");
      return null;
    }
    const city = data.city ?? "";

    const times = data.hourly.time;
    const temps = data.hourly.temperature_2m ?? [];
    const codes = data.hourly.weathercode ?? [];
    const hourly: HourlyWeather[] = [];
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let mainCode = 0;

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      if (!t?.startsWith(dateStr)) continue;
      const h = parseInt(t.slice(11, 13), 10);
      const temp = temps[i] ?? 0;
      const code = codes[i] ?? 0;
      hourly.push({ hour: h, temp, weatherCode: code });
      tempMin = Math.min(tempMin, temp);
      tempMax = Math.max(tempMax, temp);
      if (h >= 10 && h <= 18) mainCode = code;
    }

    if (hourly.length === 0) return null;

    return {
      date: dateStr,
      hourly: hourly.sort((a, b) => a.hour - b.hour),
      tempMin,
      tempMax,
      weatherCode: (mainCode || hourly[Math.floor(hourly.length / 2)]?.weatherCode) ?? 0,
      city,
    };
  } catch (e) {
    console.warn("[weather] fetch error:", e);
    return null;
  }
}
