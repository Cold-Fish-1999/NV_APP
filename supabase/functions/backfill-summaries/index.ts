import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  subWeeks,
  addMonths,
  addWeeks,
  addDays,
  isAfter,
  getDay,
} from "https://esm.sh/date-fns@3.6.0";
import { chatHealthSummary } from "../_shared/summaryAi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Reuse: Stats & AI (same as weekly-summary) ────────────────────────

interface SymptomRow {
  summary: string;
  tags: string[];
  severity: string | null;
  local_date: string;
}

interface Stats {
  log_count: number;
  top_tags: string[];
  tag_frequency: Record<string, number>;
  avg_severity: string;
  trend: "improving" | "stable" | "worsening";
}

function computeStats(rows: SymptomRow[]): Stats {
  const tagFreq: Record<string, number> = {};
  for (const r of rows) {
    for (const t of r.tags ?? []) {
      tagFreq[t] = (tagFreq[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  const severityMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const sevValues = rows
    .map((r) => severityMap[r.severity ?? ""] ?? 0)
    .filter((v) => v > 0);
  const avgSev =
    sevValues.length > 0
      ? sevValues.reduce((a, b) => a + b, 0) / sevValues.length
      : 0;
  const avgSeverityLabel =
    avgSev === 0 ? "none" : avgSev < 1.5 ? "low" : avgSev < 2.5 ? "medium" : "high";
  const mid = Math.floor(rows.length / 2);
  const firstHalf = rows.slice(0, mid);
  const secondHalf = rows.slice(mid);
  const avgSevHalf = (half: SymptomRow[]) => {
    const v = half
      .map((r) => severityMap[r.severity ?? ""] ?? 0)
      .filter((x) => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const diff = avgSevHalf(secondHalf) - avgSevHalf(firstHalf);
  const trend: Stats["trend"] =
    diff < -0.3 ? "improving" : diff > 0.3 ? "worsening" : "stable";
  return {
    log_count: rows.length,
    top_tags: topTags,
    tag_frequency: tagFreq,
    avg_severity: avgSeverityLabel,
    trend,
  };
}

const MONTHLY_BACKFILL_PROMPT =
  "You are a health analyst. Write a higher-level monthly health report from the following raw symptom logs. Identify trends, recurring symptoms, notable improvements or deteriorations, and overall health trajectory. Be concise and factual.";

const WEEKLY_BACKFILL_PROMPT =
  "You are a health analyst. Write a concise summary of the user's symptoms and health patterns observed during this week. Highlight notable symptoms, frequency, severity trends, and any patterns. Be factual and brief.";

const ROLLING_WEEKLY_PROMPT =
  "You are a health analyst. Summarize the user's symptoms and health patterns since their last monthly report. Highlight recurring issues, severity changes, and anything noteworthy. Be concise.";

const QUARTERLY_PROMPT =
  "You are a health analyst. Analyze the following monthly health reports spanning approximately 3 months. Provide a quarterly health trend analysis covering major patterns, significant changes, and an overall trajectory assessment. Be concise.";

const BIANNUAL_PROMPT =
  "You are a health analyst. Review the following monthly health reports spanning approximately 6 months. Provide a longitudinal health overview identifying long-term trends, chronic issues, seasonal patterns, and overall health trajectory. Be concise.";

// ── Reuse: upsertSummary (same as weekly-summary) ──────────────────────

async function upsertSummary(
  userId: string,
  level: string,
  windowStart: string,
  windowEnd: string,
  summary: string,
  stats: Stats
) {
  await supabaseAdmin
    .from("health_summaries")
    .update({ is_latest: false })
    .eq("user_id", userId)
    .eq("level", level)
    .eq("is_latest", true);

  await supabaseAdmin.from("health_summaries").insert({
    user_id: userId,
    level,
    is_latest: true,
    window_start: windowStart,
    window_end: windowEnd,
    summary,
    stats,
  });
}

// ── Reuse: refreshQuarterly, refreshBiannual (from monthly-summary) ──────

interface SummaryRow {
  summary: string;
  stats: { log_count?: number; top_tags?: string[]; tag_frequency?: Record<string, number>; avg_severity?: string; trend?: string } | null;
  window_start: string;
  window_end: string;
}

function aggregateStats(rows: SummaryRow[]): Stats {
  let totalLogs = 0;
  const tagFreq: Record<string, number> = {};
  for (const r of rows) {
    if (!r.stats) continue;
    totalLogs += r.stats.log_count || 0;
    for (const [tag, count] of Object.entries(r.stats.tag_frequency ?? {})) {
      tagFreq[tag] = (tagFreq[tag] || 0) + count;
    }
  }
  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  const severityMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const sevValues = rows
    .map((r) => severityMap[r.stats?.avg_severity ?? ""] ?? 0)
    .filter((v) => v > 0);
  const avgSev =
    sevValues.length > 0
      ? sevValues.reduce((a, b) => a + b, 0) / sevValues.length
      : 0;
  const avgSeverityLabel =
    avgSev === 0 ? "none" : avgSev < 1.5 ? "low" : avgSev < 2.5 ? "medium" : "high";
  const trendMap: Record<string, number> = { improving: -1, stable: 0, worsening: 1 };
  const trendValues = rows.map((r) => trendMap[r.stats?.trend ?? ""] ?? 0);
  const avgTrend =
    trendValues.length > 0
      ? trendValues.reduce((a, b) => a + b, 0) / trendValues.length
      : 0;
  const trend: Stats["trend"] =
    avgTrend < -0.3 ? "improving" : avgTrend > 0.3 ? "worsening" : "stable";
  return { log_count: totalLogs, top_tags: topTags, tag_frequency: tagFreq, avg_severity: avgSeverityLabel, trend };
}

async function refreshQuarterly(userId: string) {
  const { data: monthlies } = await supabaseAdmin
    .from("health_summaries")
    .select("summary, stats, window_start, window_end")
    .eq("user_id", userId)
    .eq("level", "monthly")
    .order("window_start", { ascending: false })
    .limit(3);

  if (!monthlies || monthlies.length === 0) return;

  const sorted = [...monthlies].reverse();
  const content = sorted
    .map((r) => `[Month ${r.window_start} – ${r.window_end}]\n${r.summary}`)
    .join("\n\n");

  const summary = await chatHealthSummary("backfill_quarterly", QUARTERLY_PROMPT, content, OPENAI_API_KEY);
  const stats = aggregateStats(sorted);

  await upsertSummary(
    userId,
    "quarterly",
    sorted[0].window_start,
    sorted[sorted.length - 1].window_end,
    summary,
    stats
  );
}

async function refreshBiannual(userId: string) {
  const { data: monthlies } = await supabaseAdmin
    .from("health_summaries")
    .select("summary, stats, window_start, window_end")
    .eq("user_id", userId)
    .eq("level", "monthly")
    .order("window_start", { ascending: false })
    .limit(6);

  if (!monthlies || monthlies.length === 0) return;

  const sorted = [...monthlies].reverse();
  const content = sorted
    .map((r) => `[Month ${r.window_start} – ${r.window_end}]\n${r.summary}`)
    .join("\n\n");

  const summary = await chatHealthSummary("backfill_biannual", BIANNUAL_PROMPT, content, OPENAI_API_KEY);
  const stats = aggregateStats(sorted);

  await upsertSummary(
    userId,
    "biannual",
    sorted[0].window_start,
    sorted[sorted.length - 1].window_end,
    summary,
    stats
  );
}

async function refreshRollingWeekly(userId: string, lastSunday: string) {
  const { data: latestMonthly } = await supabaseAdmin
    .from("health_summaries")
    .select("window_end")
    .eq("user_id", userId)
    .eq("level", "monthly")
    .eq("is_latest", true)
    .limit(1)
    .single();

  let rollingStart: string;
  if (latestMonthly?.window_end) {
    rollingStart = latestMonthly.window_end;
  } else {
    const { data: earliest } = await supabaseAdmin
      .from("symptom_summaries")
      .select("local_date")
      .eq("user_id", userId)
      .order("local_date", { ascending: true })
      .limit(1)
      .single();

    if (!earliest?.local_date) return;
    rollingStart = earliest.local_date;
  }

  const { data: rows } = await supabaseAdmin
    .from("symptom_summaries")
    .select("summary, tags, severity, local_date")
    .eq("user_id", userId)
    .gt("local_date", rollingStart)
    .lte("local_date", lastSunday)
    .order("local_date", { ascending: true });

  if (!rows || rows.length === 0) return;

  const content = rows
    .map((r) => `[${r.local_date}] (severity: ${r.severity ?? "n/a"}) ${r.summary}`)
    .join("\n");

  const summary = await chatHealthSummary(
    "backfill_rolling",
    ROLLING_WEEKLY_PROMPT,
    content,
    OPENAI_API_KEY
  );
  const stats = computeStats(rows);

  await upsertSummary(userId, "rolling_weekly", rollingStart, lastSunday, summary, stats);
}

// ── Main: pick one pending job, process, mark done/failed ──────────────

serve(async (_req) => {
  try {
    const { data: jobs, error: fetchErr } = await supabaseAdmin
      .from("summary_generation_queue")
      .select("id, user_id, attempts")
      .eq("status", "pending")
      .or("level.eq.backfill,level.is.null")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchErr || !jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, reason: "no_pending_jobs" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const job = jobs[0];
    const userId = job.user_id as string;

    await supabaseAdmin
      .from("summary_generation_queue")
      .update({ status: "processing" })
      .eq("id", job.id);

    try {
      await runBackfill(userId);
      await supabaseAdmin
        .from("summary_generation_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", job.id);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const attempts = (job.attempts ?? 0) + 1;
      const status = attempts >= 2 ? "failed" : "pending";

      await supabaseAdmin
        .from("summary_generation_queue")
        .update({
          status,
          error: errMsg,
          attempts,
          processed_at: status === "failed" ? new Date().toISOString() : null,
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ ok: false, error: errMsg, job_id: job.id, attempts }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, processed: 1, user_id: userId }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("backfill-summaries fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function runBackfill(userId: string) {
  const today = new Date();
  const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
  const startOfThisMonth = startOfMonth(today);
  const cutoffBiannual = subMonths(startOfThisMonth, 6);

  const lastCompleteWeekEnd = endOfWeek(
    subWeeks(startOfThisWeek, 1),
    { weekStartsOn: 1 }
  );
  const lastSunday = format(lastCompleteWeekEnd, "yyyy-MM-dd");

  // ── Phase 1: monthly backfill ────────────────────────────────────────

  const { data: firstLog } = await supabaseAdmin
    .from("symptom_summaries")
    .select("local_date")
    .eq("user_id", userId)
    .gte("local_date", format(cutoffBiannual, "yyyy-MM-dd"))
    .order("local_date", { ascending: true })
    .limit(1)
    .single();

  if (firstLog?.local_date) {
    const firstMonthStart = startOfMonth(new Date(firstLog.local_date + "T12:00:00"));
    const lastCompleteMonthEnd = endOfMonth(subMonths(startOfThisMonth, 1));

    let monthStart = firstMonthStart;
    while (!isAfter(monthStart, lastCompleteMonthEnd)) {
      const monthEnd = endOfMonth(monthStart);
      const windowStart = format(monthStart, "yyyy-MM-dd");
      const windowEnd = format(monthEnd, "yyyy-MM-dd");

      const { data: existing } = await supabaseAdmin
        .from("health_summaries")
        .select("id")
        .eq("user_id", userId)
        .eq("level", "monthly")
        .eq("window_start", windowStart)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { data: rows } = await supabaseAdmin
          .from("symptom_summaries")
          .select("summary, tags, severity, local_date")
          .eq("user_id", userId)
          .gte("local_date", windowStart)
          .lte("local_date", windowEnd)
          .order("local_date", { ascending: true });

        if (rows && rows.length > 0) {
          const content = rows
            .map((r) => `[${r.local_date}] (severity: ${r.severity ?? "n/a"}) ${r.summary}`)
            .join("\n");
          const summary = await chatHealthSummary(
            "backfill_monthly",
            MONTHLY_BACKFILL_PROMPT,
            content,
            OPENAI_API_KEY
          );
          const stats = computeStats(rows);

          await supabaseAdmin.from("health_summaries").insert({
            user_id: userId,
            level: "monthly",
            is_latest: false,
            window_start: windowStart,
            window_end: windowEnd,
            summary,
            stats,
          });
        }
      }

      monthStart = addMonths(monthStart, 1);
    }

    const { data: latestMonthly } = await supabaseAdmin
      .from("health_summaries")
      .select("id")
      .eq("user_id", userId)
      .eq("level", "monthly")
      .order("window_start", { ascending: false })
      .limit(1)
      .single();

    if (latestMonthly) {
      await supabaseAdmin
        .from("health_summaries")
        .update({ is_latest: false })
        .eq("user_id", userId)
        .eq("level", "monthly")
        .eq("is_latest", true);

      await supabaseAdmin
        .from("health_summaries")
        .update({ is_latest: true })
        .eq("id", latestMonthly.id);
    }

    await refreshQuarterly(userId);
    await refreshBiannual(userId);
  }

  // ── Phase 2: weekly backfill (current month) ──────────────────────────

  const firstMondayOfMonth =
    getDay(startOfThisMonth) === 1
      ? startOfThisMonth
      : addDays(startOfThisMonth, (8 - getDay(startOfThisMonth)) % 7);
  const lastMonday = startOfWeek(lastCompleteWeekEnd, { weekStartsOn: 1 });

  let weekStart = firstMondayOfMonth;
  while (!isAfter(weekStart, lastMonday)) {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");
    const windowStart = format(weekStart, "yyyy-MM-dd");

    const { data: existing } = await supabaseAdmin
      .from("health_summaries")
      .select("id")
      .eq("user_id", userId)
      .eq("level", "weekly_snapshot")
      .eq("window_start", windowStart)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { data: rows } = await supabaseAdmin
        .from("symptom_summaries")
        .select("summary, tags, severity, local_date")
        .eq("user_id", userId)
        .gte("local_date", windowStart)
        .lte("local_date", weekEndStr)
        .order("local_date", { ascending: true });

      if (rows && rows.length > 0) {
        const content = rows
          .map((r) => `[${r.local_date}] (severity: ${r.severity ?? "n/a"}) ${r.summary}`)
          .join("\n");
        const summary = await chatHealthSummary(
          "backfill_weekly",
          WEEKLY_BACKFILL_PROMPT,
          content,
          OPENAI_API_KEY
        );
        const stats = computeStats(rows);

        await supabaseAdmin.from("health_summaries").insert({
          user_id: userId,
          level: "weekly_snapshot",
          is_latest: false,
          window_start: windowStart,
          window_end: weekEndStr,
          summary,
          stats,
        });
      }
    }

    weekStart = addWeeks(weekStart, 1);
  }

  await refreshRollingWeekly(userId, lastSunday);
}
