/**
 * Backfill weekly_reports + monthly_reports for a specific user.
 *
 * Usage:
 *   npx tsx scripts/backfill-reports.ts <user_id> [--dry-run]
 *
 * Requires .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 */

import { config } from "dotenv";
config({ path: "apps/server/.env.local" });

import { createClient } from "@supabase/supabase-js";
import { normalizeKeywordsFromDb } from "../apps/server/lib/taxonomyDb";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const userId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!userId) {
  console.error("Usage: npx tsx scripts/backfill-reports.ts <user_id> [--dry-run]");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

// ── Date helpers ─────────────────────────────────────────────

function getMonday(d: Date): Date {
  const c = new Date(d);
  c.setHours(12, 0, 0, 0);
  const day = c.getDay();
  c.setDate(c.getDate() - (day === 0 ? 6 : day - 1));
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekLabel(mon: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const sun = addDays(mon, 6);
  return `${months[mon.getMonth()]} ${mon.getDate()}–${sun.getDate()}`;
}

function monthLabel(d: Date): string {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
}

// ── Types ────────────────────────────────────────────────────

interface SymptomRow {
  summary: string;
  tags: string[];
  severity: string | null;
  local_date: string;
}

const SEV_MAP: Record<string, number> = { low: 1, medium: 2, high: 3 };

function avgSev(rows: SymptomRow[]): number {
  const v = rows.map(r => SEV_MAP[r.severity ?? ""] ?? 0).filter(x => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function sevLabel(avg: number): string {
  if (avg === 0) return "none";
  return avg < 1.5 ? "low" : avg < 2.5 ? "medium" : "high";
}

// ── Anthropic helper ─────────────────────────────────────────

async function callAnthropic(system: string, user: string, maxTokens = 2048): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const blocks = (data.content ?? []).filter((b: any) => b.type === "text");
  return blocks[blocks.length - 1]?.text ?? "{}";
}

// ── Weekly Report Generation ─────────────────────────────────

async function generateWeeklyReport(
  weekMon: Date,
  allSymptoms: SymptomRow[]
): Promise<void> {
  const weekStart = fmt(weekMon);
  const weekEnd = fmt(addDays(weekMon, 6));
  console.log(`\n  📊 Weekly: ${weekStart} → ${weekEnd}`);

  // Check existing
  const { data: existing } = await supabase
    .from("weekly_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("    ⏭ Already exists");
    return;
  }

  // This week's rows
  const thisWeekRows = allSymptoms.filter(r => r.local_date >= weekStart && r.local_date <= weekEnd);
  if (thisWeekRows.length === 0) {
    console.log("    ⏭ No data this week");
    return;
  }
  console.log(`    ${thisWeekRows.length} records`);

  if (dryRun) {
    console.log("    [DRY RUN] Would generate report");
    return;
  }

  // Tag frequency
  const tagFreq: Record<string, number> = {};
  for (const r of thisWeekRows) for (const t of r.tags) tagFreq[t] = (tagFreq[t] || 0) + 1;

  const topSymptoms = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const distinctTypes = new Set(thisWeekRows.flatMap(r => r.tags)).size;
  const avg = avgSev(thisWeekRows);
  const sevBreakdown = { high: 0, medium: 0, low: 0 };
  for (const r of thisWeekRows) {
    const s = r.severity as "high" | "medium" | "low" | null;
    if (s && s in sevBreakdown) sevBreakdown[s]++;
  }

  // 8-week buckets
  const weekBuckets = [];
  for (let i = 7; i >= 0; i--) {
    const mon = addDays(weekMon, -7 * i);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    weekBuckets.push({ mon, start: fmt(mon), end: fmt(addDays(mon, 6)), label: `${months[mon.getMonth()]} ${mon.getDate()}` });
  }

  // Top 10 symptoms across entire 8-week window for trends
  const trendTagFreq: Record<string, number> = {};
  const eightWeeksAgo = fmt(addDays(weekMon, -7 * 7));
  for (const r of allSymptoms.filter(r => r.local_date >= eightWeeksAgo && r.local_date <= weekEnd)) {
    for (const t of r.tags) trendTagFreq[t] = (trendTagFreq[t] || 0) + 1;
  }
  const trendTop10 = Object.entries(trendTagFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  const symptomTrends = trendTop10.map(name => ({
    name,
    trend: "" as string,
    description: "",
    weeks: weekBuckets.map(wb => ({
      label: wb.label,
      count: allSymptoms.filter(r => r.local_date >= wb.start && r.local_date <= wb.end && r.tags.includes(name)).length,
    })),
  }));

  // Overall trend
  const prevStart = fmt(addDays(weekMon, -7));
  const prevEnd = fmt(addDays(weekMon, -1));
  const prevRows = allSymptoms.filter(r => r.local_date >= prevStart && r.local_date <= prevEnd);
  const diff = avg - avgSev(prevRows);
  const overallTrend = diff < -0.3 ? "improving" : diff > 0.3 ? "worsening" : "stable";

  // Previous weeks
  const previousWeeks = [];
  for (let i = 1; i <= 3; i++) {
    const pw = addDays(weekMon, -7 * i);
    const pwS = fmt(pw);
    const pwE = fmt(addDays(pw, 6));
    const rows = allSymptoms.filter(r => r.local_date >= pwS && r.local_date <= pwE);
    if (rows.length === 0) continue;
    const d = avg - avgSev(rows);
    previousWeeks.push({
      week_start: pwS,
      week_end: pwE,
      record_count: rows.length,
      trend: d < -0.3 ? "improving" : d > 0.3 ? "worsening" : "stable",
    });
  }

  // AI insights
  let thingsToWatch: any[] = [];
  try {
    const [profileRes, docRes, sumRes] = await Promise.all([
      supabase.from("health_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_document_context").select("risk_flags, docs_summary").eq("user_id", userId).maybeSingle(),
      supabase.from("health_summaries").select("level, summary").eq("user_id", userId).eq("is_latest", true).in("level", ["rolling_weekly","monthly","quarterly"]),
    ]);

    const text = await callAnthropic(
      "You are a health data analyst. Respond ONLY with valid JSON.",
      `User profile: ${JSON.stringify(profileRes.data ?? {})}
Risk flags: ${JSON.stringify(docRes.data ?? {})}
Summaries: ${(sumRes.data ?? []).map((s: any) => `[${s.level}]: ${s.summary}`).join("\n") || "None"}
This week (${weekStart}): ${thisWeekRows.map(r => `[${r.local_date}] sev=${r.severity} tags=${r.tags.join(",")} ${r.summary}`).join("\n")}
Trends: ${JSON.stringify(symptomTrends)}

Generate JSON: {"trend_badges":[{"symptom":"...","trend":"up|same|dn","description":"..."}],"things_to_watch":[{"symptom":"...","risk":"high|medium|low","cause":"...","tip":"..."}]} (max 4 items for things_to_watch)`
    );

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (parsed.trend_badges) {
      for (const b of parsed.trend_badges) {
        const st = symptomTrends.find(s => s.name === b.symptom);
        if (st) { st.trend = b.trend; st.description = b.description; }
      }
    }
    thingsToWatch = parsed.things_to_watch ?? [];
  } catch (e) {
    console.warn(`    ⚠ AI failed: ${(e as Error).message.slice(0, 80)}`);
  }

  const reportData = {
    total_records: thisWeekRows.length,
    distinct_types: distinctTypes,
    avg_severity: sevLabel(avg),
    overall_trend: overallTrend,
    top_symptoms: topSymptoms,
    symptom_trends: symptomTrends,
    severity_breakdown: sevBreakdown,
    things_to_watch: thingsToWatch,
    previous_weeks: previousWeeks,
  };

  const { error } = await supabase.from("weekly_reports").insert({
    user_id: userId,
    week_start: weekStart,
    week_end: weekEnd,
    data: reportData,
  });

  if (error) console.error(`    ❌ Insert error: ${error.message}`);
  else console.log("    ✅ Created");
}

// ── Monthly Report Generation ────────────────────────────────

async function generateMonthlyReport(
  year: number,
  month: number,
  allSymptoms: SymptomRow[]
): Promise<void> {
  const reportMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const mStart = startOfMonth(new Date(year, month, 1));
  const mEnd = endOfMonth(new Date(year, month, 1));
  const mStartStr = fmt(mStart);
  const mEndStr = fmt(mEnd);

  console.log(`\n  📅 Monthly: ${reportMonth} (${mStartStr} → ${mEndStr})`);

  const { data: existing } = await supabase
    .from("monthly_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("report_month", reportMonth)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("    ⏭ Already exists");
    return;
  }

  const currentRows = allSymptoms.filter(r => r.local_date >= mStartStr && r.local_date <= mEndStr);
  if (currentRows.length === 0) {
    console.log("    ⏭ No data this month");
    return;
  }
  console.log(`    ${currentRows.length} records`);

  if (dryRun) {
    console.log("    [DRY RUN] Would generate report");
    return;
  }

  // Previous months for comparison
  const prevM = new Date(year, month - 1, 1);
  const twoM = new Date(year, month - 2, 1);
  const prevRows = allSymptoms.filter(r => r.local_date >= fmt(startOfMonth(prevM)) && r.local_date <= fmt(endOfMonth(prevM)));
  const twoMRows = allSymptoms.filter(r => r.local_date >= fmt(startOfMonth(twoM)) && r.local_date <= fmt(endOfMonth(twoM)));

  const totalRecords = currentRows.length;
  const distinctTypes = new Set(currentRows.flatMap(r => r.tags)).size;
  const activeDays = new Set(currentRows.map(r => r.local_date)).size;
  const vsPrev = prevRows.length > 0 ? Math.round(((totalRecords - prevRows.length) / prevRows.length) * 1000) / 10 : null;
  const vsTwo = twoMRows.length > 0 ? Math.round(((totalRecords - twoMRows.length) / twoMRows.length) * 1000) / 10 : null;

  // Tag frequency across 3 months
  const threeMonthStart = fmt(startOfMonth(twoM));
  const allThreeMonths = allSymptoms.filter(r => r.local_date >= threeMonthStart && r.local_date <= mEndStr);

  const tagFreqAll: Record<string, number> = {};
  for (const r of allThreeMonths) for (const t of r.tags) tagFreqAll[t] = (tagFreqAll[t] || 0) + 1;

  const top5 = Object.entries(tagFreqAll).filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name);

  // Weekly breakdown (~13 weeks)
  const threeMonthStartDate = startOfMonth(twoM);
  const weekStarts: Date[] = [];
  let cursor = getMonday(threeMonthStartDate);
  while (cursor <= mEnd) {
    weekStarts.push(new Date(cursor));
    cursor = addDays(cursor, 7);
  }

  const topSymptoms = top5.map(name => ({
    name,
    count: tagFreqAll[name],
    trend: "" as string,
    description: "",
    weekly_breakdown: weekStarts.map(ws => ({
      label: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][ws.getMonth()]} ${ws.getDate()}`,
      count: allThreeMonths.filter(r => r.local_date >= fmt(ws) && r.local_date <= fmt(addDays(ws, 6)) && r.tags.includes(name)).length,
    })),
  }));

  // Breakdown (donut) — use current month's own top tags
  const tagFreqCurrent: Record<string, number> = {};
  for (const r of currentRows) for (const t of r.tags) tagFreqCurrent[t] = (tagFreqCurrent[t] || 0) + 1;

  const currentTop = Object.entries(tagFreqCurrent).sort((a, b) => b[1] - a[1]);
  const breakdown: Array<{ name: string; count: number }> = [];
  let otherCount = 0;
  for (let i = 0; i < currentTop.length; i++) {
    if (i < 5) breakdown.push({ name: currentTop[i][0], count: currentTop[i][1] });
    else otherCount += currentTop[i][1];
  }
  if (otherCount > 0) breakdown.push({ name: "Other", count: otherCount });

  // AI insights
  let thingsToWatch: any[] = [];
  try {
    const [profileRes, docRes, sumRes] = await Promise.all([
      supabase.from("health_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_document_context").select("risk_flags, docs_summary").eq("user_id", userId).maybeSingle(),
      supabase.from("health_summaries").select("level, summary").eq("user_id", userId).eq("is_latest", true).in("level", ["monthly","quarterly","biannual"]),
    ]);

    const text = await callAnthropic(
      `You are a medical health analyst generating a monthly report. Respond with JSON only.`,
      `Profile: ${JSON.stringify(profileRes.data ?? {})}
Risk flags: ${JSON.stringify(docRes.data ?? {})}
Summaries: ${(sumRes.data ?? []).map((s: any) => `[${s.level}]: ${s.summary}`).join("\n") || "None"}
Month: ${monthLabel(mStart)}, ${totalRecords} records, ${distinctTypes} types, ${activeDays} active days
vs prev month: ${vsPrev !== null ? vsPrev + "%" : "N/A"}, vs 2 months: ${vsTwo !== null ? vsTwo + "%" : "N/A"}
Top symptoms: ${JSON.stringify(topSymptoms.map(s => ({ name: s.name, count: s.count })))}
Breakdown: ${JSON.stringify(breakdown)}

Generate: {"trend_badges":[{"symptom":"...","trend":"up|same|dn","description":"..."}],"things_to_watch":[{"symptom":"...","risk":"high|medium|low","cause":"...","tip":"..."}]} (max 6 items, sorted high→low)`,
      4096
    );

    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (parsed.trend_badges) {
      for (const b of parsed.trend_badges) {
        const st = topSymptoms.find(s => s.name === b.symptom);
        if (st) { st.trend = b.trend; st.description = b.description; }
      }
    }
    thingsToWatch = parsed.things_to_watch ?? [];
  } catch (e) {
    console.warn(`    ⚠ AI failed: ${(e as Error).message.slice(0, 80)}`);
  }

  const reportData = {
    total_records: totalRecords,
    distinct_types: distinctTypes,
    active_days: activeDays,
    month_label: monthLabel(mStart),
    vs_prev_month_pct: vsPrev,
    vs_two_months_pct: vsTwo,
    top_symptoms: topSymptoms,
    breakdown,
    things_to_watch: thingsToWatch,
  };

  const { error } = await supabase.from("monthly_reports").insert({
    user_id: userId,
    report_month: reportMonth,
    month_start: mStartStr,
    month_end: mEndStr,
    data: reportData,
  });

  if (error) console.error(`    ❌ Insert error: ${error.message}`);
  else console.log("    ✅ Created");
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`=== Backfill Reports ===`);
  console.log(`User: ${userId}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  // Fetch ALL symptom data for this user
  const { data: rawSymptoms, error } = await supabase
    .from("symptom_summaries")
    .select("summary, tags, severity, local_date")
    .eq("user_id", userId)
    .order("local_date", { ascending: true });

  if (error || !rawSymptoms || rawSymptoms.length === 0) {
    console.error("No symptom data found");
    return;
  }

  // Normalize all keywords via DB-backed taxonomy (with AI expansion)
  const allTags = [...new Set(rawSymptoms.flatMap(r => r.tags ?? []))];
  const tagMap = await normalizeKeywordsFromDb(
    allTags,
    ANTHROPIC_API_KEY,
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const allSymptoms: SymptomRow[] = rawSymptoms.map((r: any) => ({
    summary: r.summary as string,
    tags: [...new Set(((r.tags ?? []) as string[]).map(t => tagMap[t] ?? t))],
    severity: r.severity as string | null,
    local_date: r.local_date as string,
  }));

  console.log(`\nTotal symptom records: ${allSymptoms.length}`);
  console.log(`Date range: ${allSymptoms[0].local_date} → ${allSymptoms[allSymptoms.length - 1].local_date}`);

  // ── Weekly reports ─────────────────────────────────────────
  console.log("\n══ Weekly Reports ══");

  const earliest = new Date(allSymptoms[0].local_date + "T12:00:00");
  const today = new Date();
  const lastFullWeekMon = addDays(getMonday(today), -7);

  let cursor = getMonday(earliest);
  const weekMondays: Date[] = [];
  while (cursor <= lastFullWeekMon) {
    weekMondays.push(new Date(cursor));
    cursor = addDays(cursor, 7);
  }

  console.log(`Weeks to check: ${weekMondays.length}`);

  for (const mon of weekMondays) {
    await generateWeeklyReport(mon, allSymptoms);
  }

  // ── Monthly reports ────────────────────────────────────────
  console.log("\n══ Monthly Reports ══");

  const earliestMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  let mCursor = new Date(earliestMonth);
  const months: Array<{ year: number; month: number }> = [];
  while (mCursor <= lastFullMonth) {
    months.push({ year: mCursor.getFullYear(), month: mCursor.getMonth() });
    mCursor = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1);
  }

  console.log(`Months to check: ${months.length}`);

  for (const m of months) {
    await generateMonthlyReport(m.year, m.month, allSymptoms);
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
