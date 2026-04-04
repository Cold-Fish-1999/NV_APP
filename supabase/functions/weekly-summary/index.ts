import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  subWeeks,
  format,
  startOfWeek,
  endOfWeek,
} from "https://esm.sh/date-fns@3.6.0";
import { chatHealthSummary } from "../_shared/summaryAi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 50;

// ── Stats helpers ───────────────────────────────────────────

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

// ── AI summary ──────────────────────────────────────────────

const WEEKLY_PROMPT =
  "You are a health analyst. Write a concise summary of the user's symptoms and health patterns observed during the past week. Highlight notable symptoms, frequency, severity trends, and any patterns. Be factual and brief.";

const ROLLING_WEEKLY_PROMPT =
  "You are a health analyst. Summarize the user's symptoms and health patterns since their last monthly report. Highlight recurring issues, severity changes, and anything noteworthy. Be concise.";

// ── Upsert helper ───────────────────────────────────────────

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

// ── Main ────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const today = new Date();
    const lastMonday = startOfWeek(today, { weekStartsOn: 1 });
    const prevWeekMonday = subWeeks(lastMonday, 1);
    const prevWeekStart = format(prevWeekMonday, "yyyy-MM-dd");
    const prevWeekEnd = format(
      endOfWeek(prevWeekMonday, { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );
    const lastSunday = prevWeekEnd;

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
          await processWeeklySnapshot(user_id, prevWeekStart, prevWeekEnd);
          await processRollingWeekly(user_id, lastSunday);
          totalProcessed++;
        } catch (err) {
          console.error(`Error processing user ${user_id}:`, err);
        }
      }

      if (users.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        week: { start: prevWeekStart, end: prevWeekEnd },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("weekly-summary fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── Step 1: weekly_snapshot ─────────────────────────────────

async function processWeeklySnapshot(
  userId: string,
  weekStart: string,
  weekEnd: string
) {
  const { data: existing } = await supabaseAdmin
    .from("health_summaries")
    .select("id")
    .eq("user_id", userId)
    .eq("level", "weekly_snapshot")
    .eq("window_start", weekStart)
    .limit(1);

  if (existing && existing.length > 0) return;

  const { data: rows } = await supabaseAdmin
    .from("symptom_summaries")
    .select("summary, tags, severity, local_date")
    .eq("user_id", userId)
    .gte("local_date", weekStart)
    .lte("local_date", weekEnd)
    .order("local_date", { ascending: true });

  if (!rows || rows.length === 0) return;

  const content = rows
    .map((r) => `[${r.local_date}] (severity: ${r.severity ?? "n/a"}) ${r.summary}`)
    .join("\n");

  const summary = await chatHealthSummary(
    "weekly_snapshot",
    WEEKLY_PROMPT,
    content,
    OPENAI_API_KEY
  );
  const stats = computeStats(rows);

  await supabaseAdmin.from("health_summaries").insert({
    user_id: userId,
    level: "weekly_snapshot",
    is_latest: false,
    window_start: weekStart,
    window_end: weekEnd,
    summary,
    stats,
  });
}

// ── Step 2: rolling_weekly ──────────────────────────────────

async function processRollingWeekly(userId: string, lastSunday: string) {
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

    if (earliest?.local_date) {
      rollingStart = earliest.local_date;
    } else {
      return;
    }
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
    "rolling_weekly",
    ROLLING_WEEKLY_PROMPT,
    content,
    OPENAI_API_KEY
  );
  const stats = computeStats(rows);

  await upsertSummary(
    userId,
    "rolling_weekly",
    rollingStart,
    lastSunday,
    summary,
    stats
  );
}
