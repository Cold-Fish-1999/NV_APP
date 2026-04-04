import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  format,
  getDate,
  startOfWeek,
  endOfWeek,
  subWeeks,
} from "https://esm.sh/date-fns@3.6.0";
import { chatHealthSummary } from "../_shared/summaryAi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 50;

// ── AI summary ──────────────────────────────────────────────

const MONTHLY_PROMPT =
  "You are a health analyst. Synthesize the following weekly health summaries into a higher-level monthly report. Identify trends, recurring symptoms, notable improvements or deteriorations, and overall health trajectory. Be concise and factual.";

const QUARTERLY_PROMPT =
  "You are a health analyst. Analyze the following monthly health reports spanning approximately 3 months. Provide a quarterly health trend analysis covering major patterns, significant changes, and an overall trajectory assessment. Be concise.";

const BIANNUAL_PROMPT =
  "You are a health analyst. Review the following monthly health reports spanning approximately 6 months. Provide a longitudinal health overview identifying long-term trends, chronic issues, seasonal patterns, and overall health trajectory. Be concise.";

// ── Stats from summary rows ─────────────────────────────────

interface SummaryRow {
  summary: string;
  stats: {
    log_count: number;
    top_tags: string[];
    tag_frequency: Record<string, number>;
    avg_severity: string;
    trend: string;
  } | null;
  window_start: string;
  window_end: string;
}

function aggregateStats(rows: SummaryRow[]): {
  log_count: number;
  top_tags: string[];
  tag_frequency: Record<string, number>;
  avg_severity: string;
  trend: "improving" | "stable" | "worsening";
} {
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

  const trendMap: Record<string, number> = {
    improving: -1,
    stable: 0,
    worsening: 1,
  };
  const trendValues = rows
    .map((r) => trendMap[r.stats?.trend ?? ""] ?? 0);
  const avgTrend =
    trendValues.length > 0
      ? trendValues.reduce((a, b) => a + b, 0) / trendValues.length
      : 0;
  const trend: "improving" | "stable" | "worsening" =
    avgTrend < -0.3 ? "improving" : avgTrend > 0.3 ? "worsening" : "stable";

  return { log_count: totalLogs, top_tags: topTags, tag_frequency: tagFreq, avg_severity: avgSeverityLabel, trend };
}

// ── Upsert helper ───────────────────────────────────────────

async function upsertSummary(
  userId: string,
  level: string,
  windowStart: string,
  windowEnd: string,
  summary: string,
  stats: ReturnType<typeof aggregateStats>
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

// ── Main ────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const today = new Date();

    if (getDate(today) > 7) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "Not first Monday of month" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const lastSunday = format(
      endOfWeek(subWeeks(startOfWeek(today, { weekStartsOn: 1 }), 1), { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );

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
          await processMonthly(user_id, lastSunday);
          await processQuarterly(user_id);
          await processBiannual(user_id);
          await clearRollingWeekly(user_id);
          totalProcessed++;
        } catch (err) {
          console.error(`Error processing user ${user_id}:`, err);
        }
      }

      if (users.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    return new Response(
      JSON.stringify({ ok: true, processed: totalProcessed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("monthly-summary fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── Step 1: monthly ─────────────────────────────────────────

async function processMonthly(userId: string, lastSunday: string) {
  const { data: latestMonthly } = await supabaseAdmin
    .from("health_summaries")
    .select("window_end")
    .eq("user_id", userId)
    .eq("level", "monthly")
    .eq("is_latest", true)
    .limit(1)
    .single();

  let windowStart: string;

  if (latestMonthly?.window_end) {
    windowStart = latestMonthly.window_end;
  } else {
    const { data: oldest } = await supabaseAdmin
      .from("health_summaries")
      .select("window_start")
      .eq("user_id", userId)
      .eq("level", "weekly_snapshot")
      .order("window_start", { ascending: true })
      .limit(1)
      .single();

    if (!oldest?.window_start) return;
    windowStart = oldest.window_start;
  }

  const { data: weeklySnapshots } = await supabaseAdmin
    .from("health_summaries")
    .select("summary, stats, window_start, window_end")
    .eq("user_id", userId)
    .eq("level", "weekly_snapshot")
    .gt("window_start", windowStart)
    .order("window_start", { ascending: true });

  if (!weeklySnapshots || weeklySnapshots.length === 0) return;

  const content = weeklySnapshots
    .map(
      (r) =>
        `[Week ${r.window_start} – ${r.window_end}]\n${r.summary}`
    )
    .join("\n\n");

  const summary = await chatHealthSummary("monthly", MONTHLY_PROMPT, content, OPENAI_API_KEY);
  const stats = aggregateStats(weeklySnapshots as SummaryRow[]);

  await upsertSummary(userId, "monthly", windowStart, lastSunday, summary, stats);
}

// ── Step 2: quarterly ───────────────────────────────────────

async function processQuarterly(userId: string) {
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
    .map(
      (r) =>
        `[Month ${r.window_start} – ${r.window_end}]\n${r.summary}`
    )
    .join("\n\n");

  const summary = await chatHealthSummary("quarterly", QUARTERLY_PROMPT, content, OPENAI_API_KEY);
  const stats = aggregateStats(sorted as SummaryRow[]);

  await upsertSummary(
    userId,
    "quarterly",
    sorted[0].window_start,
    sorted[sorted.length - 1].window_end,
    summary,
    stats
  );
}

// ── Step 3: biannual ────────────────────────────────────────

async function processBiannual(userId: string) {
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
    .map(
      (r) =>
        `[Month ${r.window_start} – ${r.window_end}]\n${r.summary}`
    )
    .join("\n\n");

  const summary = await chatHealthSummary("biannual", BIANNUAL_PROMPT, content, OPENAI_API_KEY);
  const stats = aggregateStats(sorted as SummaryRow[]);

  await upsertSummary(
    userId,
    "biannual",
    sorted[0].window_start,
    sorted[sorted.length - 1].window_end,
    summary,
    stats
  );
}

// ── Step 4: clear rolling_weekly ────────────────────────────

async function clearRollingWeekly(userId: string) {
  await supabaseAdmin
    .from("health_summaries")
    .update({ is_latest: false })
    .eq("user_id", userId)
    .eq("level", "rolling_weekly")
    .eq("is_latest", true);
}
