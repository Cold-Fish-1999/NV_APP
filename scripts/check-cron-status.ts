/**
 * Check pg_cron job status and recent execution history.
 *
 * Usage:
 *   npx tsx scripts/check-cron-status.ts
 */

import { config } from "dotenv";
config({ path: "apps/server/.env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  console.log("=== Cron Job Status ===\n");

  // 1. List all registered jobs
  const { data: jobs, error: jobsErr } = await supabase.rpc("sql", {
    query: `SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname`,
  }).catch(() => ({ data: null, error: { message: "pg_cron not enabled or no access" } }));

  // Fallback: use raw query via REST if rpc doesn't work
  // For Supabase hosted, we query via the management API
  // Let's try a different approach - query the tables directly

  const { data: cronJobs, error: cronErr } = await supabase
    .from("cron.job" as any)
    .select("jobid, jobname, schedule, active")
    .order("jobname")
    .then(
      (res) => res,
      () => ({ data: null, error: { message: "Cannot query cron.job directly" } as any })
    );

  if (cronErr || !cronJobs) {
    console.log("Cannot query cron.job via Supabase client.");
    console.log("Run this SQL in Dashboard → SQL Editor instead:\n");
    printSqlQueries();
    return;
  }

  console.log("Registered jobs:");
  console.log("─".repeat(70));
  for (const j of cronJobs as any[]) {
    const status = j.active ? "✅ active" : "❌ inactive";
    console.log(`  ${status}  ${j.jobname.padEnd(30)} ${j.schedule}`);
  }

  console.log("\n\nRecent executions:");
  console.log("─".repeat(70));

  const { data: runs } = await supabase
    .from("cron.job_run_details" as any)
    .select("jobid, runid, status, start_time, end_time, return_message")
    .order("start_time", { ascending: false })
    .limit(20);

  if (runs && runs.length > 0) {
    const jobMap = Object.fromEntries((cronJobs as any[]).map((j) => [j.jobid, j.jobname]));
    for (const r of runs as any[]) {
      const name = jobMap[r.jobid] ?? `job#${r.jobid}`;
      const icon = r.status === "succeeded" ? "✅" : "❌";
      const time = r.start_time?.slice(0, 19) ?? "?";
      const msg = r.status !== "succeeded" ? ` → ${r.return_message?.slice(0, 80)}` : "";
      console.log(`  ${icon} ${time}  ${name.padEnd(28)} ${r.status}${msg}`);
    }
  } else {
    console.log("  No execution history yet.");
  }

  console.log("\n=== Done ===");
}

function printSqlQueries() {
  console.log(`-- 1. 查看所有 cron job
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;

-- 2. 查看最近 20 次执行
SELECT
  j.jobname,
  d.status,
  d.start_time,
  d.end_time,
  d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
ORDER BY d.start_time DESC
LIMIT 20;

-- 3. 只看失败
SELECT j.jobname, d.start_time, d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE d.status = 'failed'
ORDER BY d.start_time DESC
LIMIT 10;

-- 4. 查看 vault secrets 是否设置
SELECT name FROM vault.decrypted_secrets
WHERE name IN ('project_url', 'anon_key');
`);
}

main().catch(console.error);
