/**
 * Open-Meteo 天气 API（免费、无需 key）
 * - 今日/未来：forecast API
 * - 历史日期：archive API
 */

const DEFAULT_LAT = 39.9;
const DEFAULT_LON = 116.4;

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
  weatherCode: number; // 白天主要天气码
}

/** WMO 天气码转可读描述 */
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

async function fetchForecast(
  dateStr: string,
  lat: number,
  lon: number,
  tz: string,
): Promise<DayWeather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode&timezone=${tz}&past_days=1`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as {
      hourly?: { time?: string[]; temperature_2m?: number[]; weathercode?: number[] };
    };
    const times = data.hourly?.time ?? [];
    const temps = data.hourly?.temperature_2m ?? [];
    const codes = data.hourly?.weathercode ?? [];
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
      if (h >= 10 && h <= 18) mainCode = code; // 白天主要天气
    }
    if (hourly.length === 0) return null;
    return {
      date: dateStr,
      hourly: hourly.sort((a, b) => a.hour - b.hour),
      tempMin,
      tempMax,
      weatherCode: (mainCode || hourly[Math.floor(hourly.length / 2)]?.weatherCode) ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchArchive(
  dateStr: string,
  lat: number,
  lon: number,
  tz: string,
): Promise<DayWeather | null> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,weathercode&timezone=${tz}`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as {
      hourly?: { time?: string[]; temperature_2m?: number[]; weathercode?: number[] };
    };
    const times = data.hourly?.time ?? [];
    const temps = data.hourly?.temperature_2m ?? [];
    const codes = data.hourly?.weathercode ?? [];
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
    };
  } catch {
    return null;
  }
}

/** 判断是否为今日或未来（本地日期） */
function isTodayOrFuture(dateStr: string): boolean {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return dateStr >= today;
}

/** 获取指定日期的天气（小时级气温 + 天气码） */
export async function fetchDayWeather(
  dateStr: string,
  coords?: { latitude: number; longitude: number } | null,
): Promise<DayWeather | null> {
  const lat = coords?.latitude ?? DEFAULT_LAT;
  const lon = coords?.longitude ?? DEFAULT_LON;
  const tz = guessTz();

  if (isTodayOrFuture(dateStr)) {
    return fetchForecast(dateStr, lat, lon, tz);
  }
  return fetchArchive(dateStr, lat, lon, tz);
}
