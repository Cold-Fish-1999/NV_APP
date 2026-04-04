/**
 * Backfill missing weekly snapshots for a specific user.
 * Finds gaps and generates missing weekly_snapshot + rolling_weekly summaries.
 *
 * Usage:
 *   npx tsx scripts/backfill-weekly-snapshot.ts <user_id> [--dry-run]
 *
 * Requires .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.
 */

import { config } from "dotenv";
config({ path: "apps/server/.env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const userId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!userId) {
  console.error("Usage: npx tsx scripts/backfill-weekly-snapshot.ts <user_id> [--dry-run]");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set in .env.local");
  process.exit(1);
}

interface SymptomRow {
  summary: string;
  tags: string[];
  severity: string | null;
  local_date: string;
}

function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function computeStats(rows: SymptomRow[]) {
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

  const sevMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const vals = rows.map((r) => sevMap[r.severity ?? ""] ?? 0).filter((v) => v > 0);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const avgLabel = avg === 0 ? "none" : avg < 1.5 ? "low" : avg < 2.5 ? "medium" : "high";

  return { log_count: rows.length, top_tags: topTags, tag_frequency: tagFreq, avg_severity: avgLabel, trend: "stable" as const };
}

async function callOpenAI(systemPrompt: string, userContent: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

async function main() {
  console.log(`=== Backfill Weekly Snapshots ===`);
  console.log(`User: ${userId}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  // Find the date range: earliest symptom → today
  const { data: earliest } = await supabase
    .from("symptom_summaries")
    .select("local_date")
    .eq("user_id", userId)
    .order("local_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!earliest) {
    console.log("No symptom data found for this user.");
    return;
  }

  const { data: existingSnaps } = await supabase
    .from("health_summaries")
    .select("window_start")
    .eq("user_id", userId)
    .eq("level", "weekly_snapshot")
    .order("window_start", { ascending: true });

  const existingWeeks = new Set((existingSnaps ?? []).map((s) => s.window_start));
  console.log(`Existing snapshots: ${existingWeeks.size}`);

  const startMonday = getMonday(new Date(earliest.local_date + "T12:00:00"));
  const todayMonday = getMonday(new Date());
  const lastFullWeekMonday = addDays(todayMonday, -7);

  const missingWeeks: Array<{ start: string; end: string }> = [];
  let cursor = new Date(startMonday);
  while (cursor <= lastFullWeekMonday) {
    const weekStart = fmt(cursor);
    const weekEnd = fmt(addDays(cursor, 6));
    if (!existingWeeks.has(weekStart)) {
      missingWeeks.push({ start: weekStart, end: weekEnd });
    }
    cursor = addDays(cursor, 7);
  }

  console.log(`Missing weeks: ${missingWeeks.length}`);
  if (missingWeeks.length === 0) {
    console.log("Nothing to backfill!");
    return;
  }

  for (const week of missingWeeks) {
    console.log(`\n  Processing ${week.start} → ${week.end}...`);

    const { data: rows } = await supabase
      .from("symptom_summaries")
      .select("summary, tags, severity, local_date")
      .eq("user_id", userId)
      .gte("local_date", week.start)
      .lte("local_date", week.end)
      .order("local_date", { ascending: true });

    if (!rows || rows.length === 0) {
      console.log("    ⏭ No symptom data this week, skipping");
      continue;
    }

    console.log(`    ${rows.length} symptom records found`);

    if (dryRun) {
      console.log("    [DRY RUN] Would generate snapshot here");
      continue;
    }

    const content = rows.map((r) => `[${r.local_date}] (severity: ${r.severity ?? "n/a"}) ${r.summary}`).join("\n");

    const prompt = "You are a health analyst. Write a concise summary of the user's symptoms and health patterns observed during the past week. Highlight notable symptoms, frequency, severity trends, and any patterns. Be factual and brief in under 100 words.";

    try {
      const summary = await callOpenAI(prompt, content, 120);
      const stats = computeStats(rows);

      const { error } = await supabase.from("health_summaries").insert({
        user_id: userId,
        level: "weekly_snapshot",
        is_latest: false,
        window_start: week.start,
        window_end: week.end,
        summary,
        stats,
      });

      if (error) {
        console.error(`    ❌ Insert error: ${error.message}`);
      } else {
        console.log(`    ✅ Snapshot created`);
      }
    } catch (e) {
      console.error(`    ❌ AI error: ${(e as Error).message}`);
    }
  }

  // Refresh rolling_weekly
  console.log("\n── Refreshing rolling_weekly ──");
  if (!dryRun) {
    const { data: latestMonthly } = await supabase
      .from("health_summaries")
      .select("window_end")
      .eq("user_id", userId)
      .eq("level", "monthly")
      .eq("is_latest", true)
      .limit(1)
      .maybeSingle();

    let rollingStart = latestMonthly?.window_end ?? earliest.local_date;

    const lastSunday = fmt(addDays(lastFullWeekMonday, 6));

    const { data: rollingRows } = await supabase
      .from("symptom_summaries")
      .select("summary, tags, severity, local_date")
      .eq("user_id", userId)
      .gt("local_date", rollingStart)
      .lte("local_date", lastSunday)
      .order("local_date", { ascending: true });

    if (rollingRows && rollingRows.length > 0) {
      const content = rollingRows.map((r) => `[${r.local_date}] (severity: ${r.severity ?? "n/a"}) ${r.summary}`).join("\n");
      const prompt = "You are a health analyst. Summarize the user's symptoms and health patterns since their last monthly report. Highlight recurring issues, severity changes, and anything noteworthy. Be concise in under 150 words.";

      try {
        const summary = await callOpenAI(prompt, content, 220);
        const stats = computeStats(rollingRows);

        await supabase
          .from("health_summaries")
          .update({ is_latest: false })
          .eq("user_id", userId)
          .eq("level", "rolling_weekly")
          .eq("is_latest", true);

        const { error } = await supabase.from("health_summaries").insert({
          user_id: userId,
          level: "rolling_weekly",
          is_latest: true,
          window_start: rollingStart,
          window_end: lastSunday,
          summary,
          stats,
        });

        if (error) console.error(`  ❌ rolling_weekly insert error: ${error.message}`);
        else console.log(`  ✅ rolling_weekly refreshed: ${rollingStart} → ${lastSunday}`);
      } catch (e) {
        console.error(`  ❌ AI error: ${(e as Error).message}`);
      }
    } else {
      console.log("  No data for rolling_weekly");
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
