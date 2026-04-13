import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  subWeeks,
  format,
  startOfWeek,
  endOfWeek,
} from "https://esm.sh/date-fns@3.6.0";
import {
  normalizeKeywordsBatch,
  applyMapping,
} from "../_shared/normalizeKeywords.ts";
import { docCategoryLabel } from "../_shared/docCategory.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 50;

// ── Types ────────────────────────────────────────────────────

interface SymptomRow {
  summary: string;
  tags: string[];
  severity: string | null;
  local_date: string;
  category: string;
}

interface TopSymptom {
  name: string;
  count: number;
}

interface WeekBucket {
  label: string;
  count: number;
}

interface SymptomTrend {
  name: string;
  trend: "up" | "same" | "dn";
  description: string;
  weeks: WeekBucket[];
}

interface ThingToWatch {
  symptom: string;
  risk: "high" | "medium" | "low";
  cause: string;
  tip?: string;
}

interface PreviousWeek {
  week_start: string;
  week_end: string;
  record_count: number;
  trend: string;
}

interface ReportData {
  total_records: number;
  distinct_types: number;
  avg_severity: string;
  overall_trend: string;
  top_symptoms: TopSymptom[];
  symptom_trends: SymptomTrend[];
  severity_breakdown: { high: number; medium: number; low: number };
  things_to_watch: ThingToWatch[];
  previous_weeks: PreviousWeek[];
  medication_summary: TopSymptom[];
  medication_trends: SymptomTrend[];
}

// ── Helpers ──────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, number> = { low: 1, medium: 2, high: 3 };

function severityLabel(avg: number): string {
  if (avg === 0) return "none";
  if (avg < 1.5) return "low";
  if (avg < 2.5) return "medium";
  return "high";
}

function avgSeverity(rows: SymptomRow[]): number {
  const vals = rows
    .map((r) => SEVERITY_MAP[r.severity ?? ""] ?? 0)
    .filter((v) => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function weekLabel(monday: Date, sunday: Date): string {
  const mStr = format(monday, "MMM d");
  const sDay = format(sunday, "d");
  return `${mStr}–${sDay}`;
}

// ── Main ─────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const today = new Date();
    const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
    const targetMonday = subWeeks(thisMonday, 1);
    const targetSunday = endOfWeek(targetMonday, { weekStartsOn: 1 });
    const weekStart = format(targetMonday, "yyyy-MM-dd");
    const weekEnd = format(targetSunday, "yyyy-MM-dd");

    let offset = 0;
    let totalProcessed = 0;

    while (true) {
      const { data: users, error: usersErr } = await supabaseAdmin
        .from("user_entitlements")
        .select("user_id")
        .eq("is_pro", true)
        .range(offset, offset + BATCH_SIZE - 1);

      if (usersErr) {
        console.error("Error fetching users:", usersErr);
        break;
      }
      if (!users || users.length === 0) break;

      for (const { user_id } of users) {
        try {
          await processUser(user_id, targetMonday, targetSunday, weekStart, weekEnd);
          totalProcessed++;
        } catch (err) {
          console.error(`Error processing user ${user_id}:`, err);
        }
      }

      if (users.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    return new Response(
      JSON.stringify({ ok: true, processed: totalProcessed, week: { start: weekStart, end: weekEnd } }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-weekly-report fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── Per-user pipeline ────────────────────────────────────────

async function processUser(
  userId: string,
  targetMonday: Date,
  targetSunday: Date,
  weekStart: string,
  weekEnd: string,
) {
  // Step 1: skip if report already exists
  const { data: existing } = await supabaseAdmin
    .from("weekly_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Step 2: fetch last 8 weeks of data & normalize keywords
  const fourWeeksAgo = format(subWeeks(targetMonday, 7), "yyyy-MM-dd");

  const { data: allRows } = await supabaseAdmin
    .from("symptom_summaries")
    .select("summary, tags, severity, local_date, category")
    .eq("user_id", userId)
    .gte("local_date", fourWeeksAgo)
    .lte("local_date", weekEnd)
    .order("local_date", { ascending: true });

  if (!allRows || allRows.length === 0) return;

  const uniqueKeywords = [...new Set(allRows.flatMap((r) => r.tags ?? []))];
  const mapping = await normalizeKeywordsBatch(uniqueKeywords, ANTHROPIC_API_KEY);

  const normalizedRows: SymptomRow[] = allRows.map((r) => ({
    ...r,
    category: r.category || "symptom_feeling",
    tags: applyMapping(r.tags ?? [], mapping),
  }));

  const isSymptom = (r: SymptomRow) => r.category === "symptom_feeling";
  const isMed = (r: SymptomRow) => r.category === "medication_supplement";

  // Split into current week rows
  const thisWeekRows = normalizedRows.filter(
    (r) => r.local_date >= weekStart && r.local_date <= weekEnd,
  );

  if (thisWeekRows.length === 0) return;

  const thisWeekSymptoms = thisWeekRows.filter(isSymptom);
  const allSymptomRows = normalizedRows.filter(isSymptom);
  const allMedRows = normalizedRows.filter(isMed);
  const thisWeekMeds = thisWeekRows.filter(isMed);

  // Step 3: compute stats for this week (symptom_feeling only)
  const tagFreq: Record<string, number> = {};
  for (const r of thisWeekSymptoms) {
    for (const t of r.tags) {
      tagFreq[t] = (tagFreq[t] || 0) + 1;
    }
  }

  const topSymptoms: TopSymptom[] = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const distinctTypes = new Set(thisWeekSymptoms.flatMap((r) => r.tags)).size;

  const avgSev = avgSeverity(thisWeekSymptoms);
  const avgSeverityStr = severityLabel(avgSev);

  const severityBreakdown = { high: 0, medium: 0, low: 0 };
  for (const r of thisWeekSymptoms) {
    const s = r.severity as "high" | "medium" | "low" | null;
    if (s && s in severityBreakdown) severityBreakdown[s]++;
  }

  // Build 8-week buckets
  const weekBuckets: { monday: Date; sunday: Date; label: string; start: string; end: string }[] = [];
  for (let i = 7; i >= 0; i--) {
    const mon = subWeeks(targetMonday, i);
    const sun = endOfWeek(mon, { weekStartsOn: 1 });
    weekBuckets.push({
      monday: mon,
      sunday: sun,
      label: format(mon, "MMM d"),
      start: format(mon, "yyyy-MM-dd"),
      end: format(sun, "yyyy-MM-dd"),
    });
  }

  // Symptom trends (symptom_feeling only, 8-week window, >=3)
  const trendTagFreq: Record<string, number> = {};
  for (const r of allSymptomRows) {
    for (const t of r.tags) trendTagFreq[t] = (trendTagFreq[t] || 0) + 1;
  }
  const trendTop10 = Object.entries(trendTagFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  const symptomTrends: SymptomTrend[] = trendTop10.map((name) => {
    const weeks: WeekBucket[] = weekBuckets.map((wb) => {
      const count = allSymptomRows.filter(
        (r) => r.local_date >= wb.start && r.local_date <= wb.end && r.tags.includes(name),
      ).length;
      return { label: wb.label, count };
    });
    return { name, trend: "" as "up" | "same" | "dn", description: "", weeks };
  });

  // Medication summary + trends (medication_supplement only)
  const medTagFreq: Record<string, number> = {};
  for (const r of thisWeekMeds) {
    for (const t of r.tags) medTagFreq[t] = (medTagFreq[t] || 0) + 1;
  }
  const medicationSummary: TopSymptom[] = Object.entries(medTagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const medTrendFreq: Record<string, number> = {};
  for (const r of allMedRows) {
    for (const t of r.tags) medTrendFreq[t] = (medTrendFreq[t] || 0) + 1;
  }
  const medTrendTop = Object.entries(medTrendFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  const medicationTrends: SymptomTrend[] = medTrendTop.map((name) => {
    const weeks: WeekBucket[] = weekBuckets.map((wb) => {
      const count = allMedRows.filter(
        (r) => r.local_date >= wb.start && r.local_date <= wb.end && r.tags.includes(name),
      ).length;
      return { label: wb.label, count };
    });
    return { name, trend: "" as "up" | "same" | "dn", description: "", weeks };
  });

  // Overall trend: compare this week vs previous week avg severity (symptom_feeling only)
  const prevWeekStart = format(subWeeks(targetMonday, 1), "yyyy-MM-dd");
  const prevWeekEnd = format(endOfWeek(subWeeks(targetMonday, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const prevWeekRows = allSymptomRows.filter(
    (r) => r.local_date >= prevWeekStart && r.local_date <= prevWeekEnd,
  );
  const prevAvgSev = avgSeverity(prevWeekRows);
  const sevDiff = avgSev - prevAvgSev;
  const overallTrend = sevDiff < -0.3 ? "improving" : sevDiff > 0.3 ? "worsening" : "stable";

  // Step 4: previous weeks summary
  const previousWeeks: PreviousWeek[] = [];
  for (let i = 1; i <= 3; i++) {
    const pwMon = subWeeks(targetMonday, i);
    const pwSun = endOfWeek(pwMon, { weekStartsOn: 1 });
    const pwStart = format(pwMon, "yyyy-MM-dd");
    const pwEnd = format(pwSun, "yyyy-MM-dd");
    const pwRows = normalizedRows.filter((r) => r.local_date >= pwStart && r.local_date <= pwEnd);
    if (pwRows.length === 0) continue;
    const pwAvg = avgSeverity(pwRows);
    const thisDiff = avgSev - pwAvg;
    const trend = thisDiff < -0.3 ? "improving" : thisDiff > 0.3 ? "worsening" : "stable";
    previousWeeks.push({ week_start: pwStart, week_end: pwEnd, record_count: pwRows.length, trend });
  }

  // Step 5: AI generation
  let thingsToWatch: ThingToWatch[] = [];
  try {
    const aiResult = await generateAiInsights(userId, thisWeekRows, symptomTrends, weekStart, weekEnd);
    if (aiResult) {
      if (aiResult.trend_badges) {
        for (const badge of aiResult.trend_badges) {
          const st = symptomTrends.find((s) => s.name === badge.symptom);
          if (st) {
            st.trend = badge.trend;
            st.description = badge.description;
          }
        }
      }
      if (aiResult.things_to_watch) {
        thingsToWatch = aiResult.things_to_watch;
      }
    }
  } catch (err) {
    console.error(`AI generation failed for ${userId}:`, err);
  }

  // Step 6: write to DB
  const reportData: ReportData = {
    total_records: thisWeekSymptoms.length,
    distinct_types: distinctTypes,
    avg_severity: avgSeverityStr,
    overall_trend: overallTrend,
    top_symptoms: topSymptoms,
    symptom_trends: symptomTrends,
    severity_breakdown: severityBreakdown,
    things_to_watch: thingsToWatch,
    previous_weeks: previousWeeks,
    medication_summary: medicationSummary,
    medication_trends: medicationTrends,
  };

  await supabaseAdmin.from("weekly_reports").insert({
    user_id: userId,
    week_start: weekStart,
    week_end: weekEnd,
    data: reportData,
  });
}

// ── AI insights ──────────────────────────────────────────────

interface AiResult {
  trend_badges: { symptom: string; trend: "up" | "same" | "dn"; description: string }[];
  things_to_watch: ThingToWatch[];
}

async function generateAiInsights(
  userId: string,
  thisWeekRows: SymptomRow[],
  symptomTrends: SymptomTrend[],
  weekStart: string,
  weekEnd: string,
): Promise<AiResult | null> {
  // Fetch user context: profile, individual doc captions, risk flags, health summaries
  const [profileRes, docUploadsRes, docCtxRes, summariesRes] = await Promise.all([
    supabaseAdmin.from("health_profiles").select("*").eq("user_id", userId).limit(1).single(),
    supabaseAdmin
      .from("profile_document_uploads")
      .select("record_id, group_title, group_ai_summary, group_user_summary, ai_summary, created_at, report_date, category")
      .eq("user_id", userId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin.from("user_document_context").select("risk_flags").eq("user_id", userId).limit(1).single(),
    supabaseAdmin
      .from("health_summaries")
      .select("level, summary")
      .eq("user_id", userId)
      .eq("is_latest", true)
      .in("level", ["rolling_weekly", "monthly", "quarterly"]),
  ]);

  const profile = profileRes.data;
  const riskFlags = docCtxRes.data?.risk_flags ?? [];
  const summaries = summariesRes.data ?? [];

  // Deduplicate by record_id, build per-document entries with date
  const docRows = docUploadsRes.data ?? [];
  const seenRecords = new Set<string>();
  const docEntries: string[] = [];
  for (const d of docRows) {
    const rid = d.record_id ?? d.id;
    if (seenRecords.has(rid)) continue;
    seenRecords.add(rid);
    const title = (d.group_title ?? "").trim();
    const caption = (d.group_ai_summary ?? d.ai_summary ?? "").trim();
    const userNote = (d.group_user_summary ?? "").trim();
    if (!caption && !title) continue;
    if (title === "Not a health document") continue;
    const reportDate = (d as any).report_date ?? null;
    const dateLabel = reportDate ?? (d.created_at ? d.created_at.slice(0, 10) : "unknown");
    const cat = docCategoryLabel((d as { category?: string }).category);
    let entry = `[${cat} | ${dateLabel}] ${title}`;
    if (userNote) entry += ` | User note: ${userNote}`;
    entry += ` — ${caption}`;
    docEntries.push(entry);
  }

  const systemPrompt = `You are a health data analyst. Analyze the user's weekly symptom data and medical documents to produce structured insights. Respond ONLY with valid JSON, no markdown, no explanation.`;

  const userPrompt = `REPORT PERIOD: ${weekStart} to ${weekEnd} (this is the week being reported on)

## User Profile
${JSON.stringify(profile ?? {}, null, 2)}

## Risk Flags
${riskFlags.length > 0 ? riskFlags.join(", ") : "None"}

## Medical Documents (with upload dates — pay attention to document dates mentioned in the captions)
${docEntries.length > 0 ? docEntries.join("\n") : "No documents uploaded"}

IMPORTANT: When referencing document findings in things_to_watch, consider the document's actual date (mentioned in caption) vs the report period. Recent documents are more relevant. Old documents (months ago) should be weighted less unless they indicate chronic/ongoing conditions.

## Recent Health Summaries
${summaries.map((s: { level: string; summary: string }) => `[${s.level}]: ${s.summary}`).join("\n") || "None available"}

## This Week's Symptom Records (${thisWeekRows.length} entries)
${thisWeekRows.map((r: SymptomRow) => `[${r.local_date}] severity=${r.severity ?? "n/a"} tags=${r.tags.join(", ")} — ${r.summary}`).join("\n")}

## Symptom Trends (last 8 weeks)
${JSON.stringify(symptomTrends, null, 2)}

Based on all this context, produce a JSON object with exactly these fields:
1. "trend_badges": For each symptom in the trends data, compare this week's count vs the 3-week average. Return:
   - "symptom": the symptom name (must match exactly)
   - "trend": "up" if notably higher, "dn" if notably lower, "same" if roughly stable
   - "description": a short human-readable note (e.g. "down from 6 last week")
2. "things_to_watch": Up to 4 items the user should pay attention to based on their profile, medical documents, health summaries, and this week's symptoms. Each item:
   - "symptom": the symptom or concern
   - "risk": "high", "medium", or "low"
   - "cause": why this is flagged (reference specific document dates if relevant)
   - "tip": optional actionable advice

Respond ONLY with valid JSON:
{
  "trend_badges": [...],
  "things_to_watch": [...]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    console.error(`Anthropic API error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "{}";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as AiResult;
}
