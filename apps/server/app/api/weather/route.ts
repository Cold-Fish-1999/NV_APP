import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const lat = searchParams.get("lat") ?? "39.9";
  const lon = searchParams.get("lon") ?? "116.4";
  const tz = searchParams.get("tz") ?? "Asia/Shanghai";

  if (!date) {
    return NextResponse.json(
      { error: "date parameter required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode&timezone=${encodeURIComponent(tz)}&start_date=${date}&end_date=${date}`;
  const geoUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;

  try {
    const [weatherRes, geoRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(geoUrl).catch(() => null),
    ]);

    let weatherData: Record<string, unknown> | null = null;

    if (weatherRes.ok) {
      weatherData = await weatherRes.json();
    } else {
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,weathercode&timezone=${encodeURIComponent(tz)}`;
      const archiveRes = await fetch(archiveUrl);
      if (archiveRes.ok) {
        weatherData = await archiveRes.json();
      }
    }

    if (!weatherData) {
      return NextResponse.json(
        { error: "Weather API unavailable" },
        { status: 502, headers: corsHeaders },
      );
    }

    let city = "";
    if (geoRes?.ok) {
      const geo = await geoRes.json();
      city = geo.city || geo.locality || geo.principalSubdivision || "";
    }

    return NextResponse.json(
      { ...weatherData, city },
      { headers: corsHeaders },
    );
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 502, headers: corsHeaders },
    );
  }
}
