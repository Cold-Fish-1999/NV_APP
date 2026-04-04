# Supabase 初始化说明

## 1. 执行 SQL 迁移

在 Supabase Dashboard → SQL Editor 中执行：

1. `migrations/001_init_tables.sql`（daily_logs、chat_messages）
2. `migrations/002_symptom_summaries.sql`（symptom_summaries）
3. `migrations/003_health_profiles.sql`（health_profiles 健康档案）
4. `migrations/004_user_context_snapshots.sql`（历史：曾创建快照表；随后由 `017_remove_user_context_snapshots.sql` 删除）
5. `migrations/008_user_entitlements.sql`（user_entitlements 订阅权限，见 `docs/subscription-mock-testing.md`）
6. … 依次执行至 `017_remove_user_context_snapshots.sql`（删除 `user_context_snapshots`、`context_refresh_jobs` 及旧入队触发器）
7. `018_profile_document_upload_limits.sql`：资料上传条数/上下文数限制（DB 强制）
8. `019_onboarding_chronic_fields_comment.sql`：更新 `onboarding_survey` 列注释（慢性病问卷字段说明）

## 2. 配置环境变量

复制 `.env.example` 为 `.env.local`（根目录或 apps/server），并填入项目凭证：

- **Server**：`apps/server/.env.local`
  - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`（Chat 使用 GPT，需 OpenAI API Key）
- **Mobile**：在 `app.json` 的 `extra` 或 `.env` 中设置
  - `EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 3. Supabase Auth 配置（Magic Link 必需）

在 Supabase Dashboard → **Authentication** → **URL Configuration** 中设置：

1. **Site URL**：不要用 `localhost`，否则部分邮件客户端会出问题。建议：
   - 开发测试：`https://你的项目.supabase.co`（如 `https://abcdefgh.supabase.co`）
   - 生产环境：`https://你的域名.com`

2. **Redirect URLs**（按使用场景添加）：
   - **电脑 Web 测试**：`http://localhost:8081/auth/callback`（Expo Web 默认端口 8081）
   - **手机 / 模拟器**：`http://<电脑IP>:3000/auth/callback`（Next.js 中转页）
   - 发送 Magic Link 后，登录页会显示当前使用的 Redirect URL，确保与 Supabase 中配置一致

3. **验证 Magic Link 流程**
   - 确保手机和电脑在同一 WiFi，且 server 已启动：`pnpm dev:server`
   - 手机 `.env` 中设置 `EXPO_PUBLIC_API_URL=http://<电脑IP>:3000`
   - 在**手机**上用 Expo Go 打开 App，输入邮箱，发送 Magic Link
   - 在**同一台手机**上打开邮件，点击链接
   - 会先打开一个网页（「正在打开 App...」），**务必点击页面上的「打开 NVAPP」按钮**
   - 邮箱内嵌浏览器无法自动跳转到 `exp://`，点击按钮即可唤起 Expo Go

## 4. 代码中使用

- **Server**：`import { supabaseAdmin } from "@/lib/supabase"`
- **Mobile**：`import { supabase } from "@/lib/supabase"`

## 5. 上下文说明（当前）

- **已移除**：`user_context_snapshots` / `context_refresh_jobs` 及 `POST /api/context-refresh*`。近 14 天「总快照」不再写入数据库。
- **保留**：`health_summaries`（周/月/季/半年等由 Edge 定时生成）、`user_document_context`（资料上传/删除管道 + 队列）。
- **Chat**：服务端暂不再注入上述快照；后续在 `api/chat` 中自行拼接 `health_summaries` + `user_document_context` 等。

## 6. Health Summary Edge Functions（weekly-summary / monthly-summary）

- 仅处理 **`user_entitlements.is_pro = true`** 的用户；前端的「Mock Pro」不会写入数据库。
- 手动测试前，在 SQL Editor 中把测试用户设为 Pro（将 `YOUR_USER_ID` 换成 Profile 页底部 UID）：

```sql
INSERT INTO public.user_entitlements (user_id, is_pro)
VALUES ('YOUR_USER_ID', true)
ON CONFLICT (user_id) DO UPDATE SET is_pro = true, updated_at = now();
```

- 调用后响应会包含 `week: { start, end }`，即本次生成/尝试的周范围（周一至周日）。
- 本地触发脚本：`./scripts/invoke-edge-functions.sh weekly`、`monthly` 或 `backfill`。

## 7. Backfill（用户升级后历史摘要补全）

- 当 `user_entitlements.is_pro` 被设为 `true` 时，数据库触发器会自动向 `summary_generation_queue` 插入 **`level='backfill'`** 与 **`level='document_context'`** 各一条待处理任务（后者用于重建 `user_document_context`）。
- Edge Function `backfill-summaries` 每 5 分钟执行一次，每次处理一个 **仅 `backfill`（或 `level` 为空）** 的 pending 任务；`document_context` 由下方队列函数处理。
- 需在 pg_cron 中注册：`*/5 * * * *` 调用 `backfill-summaries`（与 weekly/monthly 的 pg_cron 配置方式相同）。

## 8. 档案资料聚合上下文（`user_document_context`）

- 迁移：`migrations/015_user_document_context.sql`、`migrations/016_summary_queue_scheduled_at.sql`（`summary_generation_queue.scheduled_at` + 升级时双队列）。
- **增量更新**：服务端 `POST /api/profile-document-analyze` 在每条资料 `status=ready` 且 `ai_summary` 写入后调用 `incrementalRefreshDocumentContext`。
- **删除防抖**：客户端删除记录后调用 `POST /api/document-context-schedule-refresh`（鉴权），仅入队 `document_context`，由定时任务执行全文 `refreshDocumentContext`。
- Edge Functions：**勿在 `supabase/config.toml` 的 `[functions.*]` 下写 `schedule`**（当前 CLI 会解析失败、无法 `deploy`）。请在 **Dashboard → Edge Functions → 各函数 → Cron** 配置：
  - `process-document-queue`：`*/5 * * * *`，每次最多处理 20 条已到期的 `document_context` pending 任务。
  - `retry-document-queue`：`*/30 * * * *`，将 24 小时内失败的 `document_context` 任务重置为 pending。

```bash
supabase functions deploy process-document-queue
supabase functions deploy retry-document-queue
```

---

## SQL 分段说明

### 1) daily_logs 表

| 段落 | 作用 |
|------|------|
| `CREATE TABLE daily_logs` | 创建每日健康记录表，字段：id、user_id、date、payload、created_at、updated_at |
| `ADD CONSTRAINT daily_logs_user_id_date_key` | 保证每个用户每天仅一条记录 |
| `ENABLE ROW LEVEL SECURITY` | 启用行级安全 |
| `daily_logs_select/insert/update/delete_own` | RLS 策略：用户只能读写自己的数据 |
| `set_updated_at` 触发器 | 更新行时自动刷新 `updated_at` |

### 2) chat_messages 表

| 段落 | 作用 |
|------|------|
| `CREATE TABLE chat_messages` | 创建对话记录表，role 限定为 system/user/assistant |
| `chat_messages_user_created_idx` | 按用户 + 时间倒序查历史消息 |
| `chat_messages_user_local_date_idx` | 按用户 + 本地日期分组查询 |
| `ENABLE ROW LEVEL SECURITY` | 启用 RLS |
| `chat_messages_*_own` 策略 | 用户只能读写自己的对话 |

### payload 结构（daily_logs）

与 `@nvapp/shared` 中的 DailyLog 一致：

```json
{
  "rawInput": "用户原始描述",
  "structuredContent": {
    "earlyMorning": { "symptoms": [], "feelings": [], "behaviors": [], "notes": "" },
    "morning": { ... },
    "noon": { ... },
    "evening": { ... },
    "lateNight": { ... }
  }
}
```

## Edge Functions：健康摘要 AI 配置

`functions/_shared/summaryAi.ts` 集中定义各摘要类型的 **模型**（`SUMMARY_MODELS`）与 **长度**（`SUMMARY_LENGTH`：`prompt` 字数提示 + `max_tokens`）。`weekly-summary`、`monthly-summary`、`backfill-summaries` 通过 `chatHealthSummary(kind, ...)` 调用 OpenAI。

部署时需从仓库根目录执行，CLI 会打包同目录下的 `_shared` 引用：

```bash
supabase functions deploy weekly-summary
supabase functions deploy monthly-summary
supabase functions deploy backfill-summaries
```
