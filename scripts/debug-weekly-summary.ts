/**
 * Debug script: diagnose why weekly health summaries stopped generating.
 *
 * Usage:
 *   npx tsx scripts/debug-weekly-summary.ts [user_id]
 *
 * If no user_id is provided, checks ALL pro users.
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from "dotenv";
config({ path: "apps/server/.env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const targetUserId = process.argv[2] || null;

async function main() {
  console.log("=== Weekly Summary Debug ===\n");
  console.log(`Date now: ${new Date().toISOString()}`);
  console.log(`Target user: ${targetUserId ?? "(all pro users)"}\n`);

  // ── 1. Check user entitlements ───────────────────────────
  console.log("── Step 1: User entitlements ──");
  if (targetUserId) {
    const { data, error } = await supabase
      .from("user_entitlements")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (error) console.error("  ERROR:", error.message);
    else if (!data) console.warn("  ⚠ No entitlement row found for this user");
    else {
      const expired = data.expires_at && new Date(data.expires_at) < new Date();
      console.log(`  is_pro: ${data.is_pro}`);
      console.log(`  plan_id: ${data.plan_id}`);
      console.log(`  expires_at: ${data.expires_at}`);
      console.log(`  expired: ${expired}`);
      if (!data.is_pro || expired) {
        console.error("  ❌ User is NOT pro → weekly-summary will skip them!");
      } else {
        console.log("  ✅ User is pro");
      }
    }
  } else {
    const { data, error } = await supabase
      .from("user_entitlements")
      .select("user_id, is_pro, expires_at")
      .eq("is_pro", true);

    if (error) console.error("  ERROR:", error.message);
    else console.log(`  Found ${data?.length ?? 0} pro users`);
  }

  // ── 2. Check existing weekly_snapshot summaries ──────────
  console.log("\n── Step 2: Existing weekly_snapshot summaries ──");
  const snapshotQuery = supabase
    .from("health_summaries")
    .select("id, user_id, level, window_start, window_end, created_at")
    .eq("level", "weekly_snapshot")
    .order("window_start", { ascending: false })
    .limit(10);

  if (targetUserId) snapshotQuery.eq("user_id", targetUserId);

  const { data: snapshots, error: snapErr } = await snapshotQuery;
  if (snapErr) console.error("  ERROR:", snapErr.message);
  else {
    if (!snapshots || snapshots.length === 0) {
      console.warn("  ⚠ No weekly_snapshot records found");
    } else {
      console.log("  Latest weekly_snapshot records:");
      for (const s of snapshots) {
        console.log(
          `    ${s.window_start} → ${s.window_end} | created: ${s.created_at?.slice(0, 19)} | user: ${s.user_id?.slice(0, 8)}...`
        );
      }
    }
  }

  // ── 3. Check rolling_weekly summaries ────────────────────
  console.log("\n── Step 3: rolling_weekly (is_latest=true) ──");
  const rollingQuery = supabase
    .from("health_summaries")
    .select("id, user_id, level, window_start, window_end, is_latest, created_at")
    .eq("level", "rolling_weekly")
    .eq("is_latest", true)
    .limit(5);

  if (targetUserId) rollingQuery.eq("user_id", targetUserId);

  const { data: rolling, error: rollErr } = await rollingQuery;
  if (rollErr) console.error("  ERROR:", rollErr.message);
  else {
    if (!rolling || rolling.length === 0) {
      console.warn("  ⚠ No latest rolling_weekly found");
    } else {
      for (const r of rolling) {
        console.log(
          `    ${r.window_start} → ${r.window_end} | created: ${r.created_at?.slice(0, 19)} | user: ${r.user_id?.slice(0, 8)}...`
        );
      }
    }
  }

  // ── 4. Check symptom data for recent weeks ───────────────
  console.log("\n── Step 4: Symptom data for recent weeks ──");
  const threeWeeksAgo = new Date();
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
  const fromDate = threeWeeksAgo.toISOString().slice(0, 10);

  const symQuery = supabase
    .from("symptom_summaries")
    .select("local_date")
    .gte("local_date", fromDate)
    .order("local_date", { ascending: true });

  if (targetUserId) symQuery.eq("user_id", targetUserId);

  const { data: syms, error: symErr } = await symQuery;
  if (symErr) console.error("  ERROR:", symErr.message);
  else {
    const byDate: Record<string, number> = {};
    for (const s of syms ?? []) {
      byDate[s.local_date] = (byDate[s.local_date] || 0) + 1;
    }
    const dates = Object.entries(byDate).sort();
    if (dates.length === 0) {
      console.warn(`  ⚠ No symptom_summaries since ${fromDate}`);
    } else {
      console.log(`  Symptom records since ${fromDate}:`);
      for (const [date, count] of dates) {
        console.log(`    ${date}: ${count} records`);
      }
    }
  }

  // ── 5. Check if OpenAI key is set ────────────────────────
  console.log("\n── Step 5: Environment keys ──");
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  console.log(`  OPENAI_API_KEY: ${hasOpenAI ? "✅ set" : "❌ NOT set"}`);
  console.log(`  ANTHROPIC_API_KEY: ${hasAnthropic ? "✅ set" : "❌ NOT set"}`);
  console.log(
    "  Note: weekly-summary uses OPENAI_API_KEY (gpt-4o). Make sure it's also set in Supabase Dashboard secrets."
  );

  // ── 6. Simulate what the function would do today ─────────
  console.log("\n── Step 6: Dry-run simulation ──");
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysToMonday);
  const prevMonday = new Date(thisMonday);
  prevMonday.setDate(thisMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);

  const prevWeekStart = prevMonday.toISOString().slice(0, 10);
  const prevWeekEnd = prevSunday.toISOString().slice(0, 10);

  console.log(`  If triggered now, would generate for: ${prevWeekStart} → ${prevWeekEnd}`);

  if (targetUserId) {
    const { data: exists } = await supabase
      .from("health_summaries")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("level", "weekly_snapshot")
      .eq("window_start", prevWeekStart)
      .limit(1);

    if (exists && exists.length > 0) {
      console.log("  ⚠ Snapshot already exists for this week → function would SKIP");
    } else {
      console.log("  ✅ No existing snapshot → function WOULD generate");
    }

    const { data: weekData } = await supabase
      .from("symptom_summaries")
      .select("id")
      .eq("user_id", targetUserId)
      .gte("local_date", prevWeekStart)
      .lte("local_date", prevWeekEnd);

    console.log(`  Symptom records in that week: ${weekData?.length ?? 0}`);
    if (!weekData || weekData.length === 0) {
      console.warn("  ⚠ No data → function would skip (nothing to summarize)");
    }
  }

  // ── 7. Gap analysis ──────────────────────────────────────
  console.log("\n── Step 7: Gap analysis ──");
  const allSnapsQuery = supabase
    .from("health_summaries")
    .select("window_start, window_end")
    .eq("level", "weekly_snapshot")
    .order("window_start", { ascending: false })
    .limit(20);

  if (targetUserId) allSnapsQuery.eq("user_id", targetUserId);

  const { data: allSnaps } = await allSnapsQuery;
  if (allSnaps && allSnaps.length >= 2) {
    console.log("  Checking for gaps between weekly snapshots:");
    for (let i = 0; i < allSnaps.length - 1; i++) {
      const current = new Date(allSnaps[i].window_start);
      const prev = new Date(allSnaps[i + 1].window_end);
      const gapDays = (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (gapDays > 2) {
        console.warn(
          `    ⚠ GAP: ${allSnaps[i + 1].window_end} → ${allSnaps[i].window_start} (${Math.round(gapDays)} days)`
        );
      }
    }
    const latestEnd = allSnaps[0].window_end;
    const daysSinceLatest = Math.round(
      (Date.now() - new Date(latestEnd).getTime()) / (1000 * 60 * 60 * 24)
    );
    console.log(`  Latest snapshot ends: ${latestEnd} (${daysSinceLatest} days ago)`);
    if (daysSinceLatest > 9) {
      console.error(`  ❌ ${daysSinceLatest} days since last snapshot — at least 1 week was missed!`);
    }
  } else {
    console.log("  Not enough snapshots for gap analysis");
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
