-- ============================================================
-- NVAPP：pg_cron + pg_net 定时调度 Edge Functions
--
-- 前置条件（需在 Dashboard 手动完成一次）：
--   1. Dashboard → Database → Extensions → 启用 pg_cron 和 pg_net
--   2. 执行以下 vault 写入（替换为你的真实值）：
--      SELECT vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--      SELECT vault.create_secret('<your-anon-key>', 'anon_key');
--
-- 本迁移假设 vault secrets 已经设置好。
-- ============================================================

-- 启用扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 清理旧 job（幂等） ─────────────────────────────────────
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'weekly-summary',
  'monthly-summary',
  'generate-weekly-report',
  'generate-monthly-report',
  'process-document-queue',
  'retry-document-queue'
);

-- ── 1) weekly-summary: 每周一 03:00 UTC ─────────────────────
SELECT cron.schedule(
  'weekly-summary',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/weekly-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 2) monthly-summary: 每周一 04:00 UTC（函数内部判断是否月初） ──
SELECT cron.schedule(
  'monthly-summary',
  '0 4 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/monthly-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 3) generate-weekly-report: 每周一 05:00 UTC ─────────────
SELECT cron.schedule(
  'generate-weekly-report',
  '0 5 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/generate-weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 4) generate-monthly-report: 每周一 06:00 UTC ────────────
SELECT cron.schedule(
  'generate-monthly-report',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/generate-monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 5) process-document-queue: 每 5 分钟 ────────────────────
SELECT cron.schedule(
  'process-document-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/process-document-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── 6) retry-document-queue: 每 30 分钟 ─────────────────────
SELECT cron.schedule(
  'retry-document-queue',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/retry-document-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
