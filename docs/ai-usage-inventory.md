# NVAPP：AI / 可计费模型调用清单

本文档汇总仓库内所有会请求 **OpenAI**、**Anthropic** 或其它可计费大模型/语音 API 的代码路径，并标注 **模型**、**提示词位置**、**触发方式**，供「按用户 token 用量限制」等设计参考。

---

## 1. 范围说明

### 1.1 计入

- 任何发起 HTTP 请求至 OpenAI / Anthropic 官方 API（含 Chat Completions、Messages、Audio Transcriptions）的路径。
- Supabase Edge Functions（Deno）中同类调用。

### 1.2 明确排除（易与 AI 混淆）

| 路径 | 说明 |
|------|------|
| `apps/server/app/api/extract-text/route.ts` | 仅 PDF / docx / 纯文本解析（mammoth、自研 PDF 文本抽取），**无 LLM**。 |
| `apps/server/lib/symptomTaxonomy.ts` | 症状词本地映射与 `normalizeKeywords`，**无外部 API**。 |
| `apps/server/app/api/document-context-schedule-refresh/route.ts` | 仅向队列写入任务，**不直接调模型**；实际 AI 见下文「文档上下文」与 `process-document-queue`。 |
| `supabase/functions/retry-document-queue/index.ts` | 将失败队列 job 置回 `pending`，**不调模型**；由 `process-document-queue` 消费。 |

---

## 2. 用户直接触发（Mobile / Web → Next.js `apps/server`）

移动端入口多定义在 [`apps/mobile/lib/api.ts`](apps/mobile/lib/api.ts)，经 `EXPO_PUBLIC_API_URL` 访问服务端。

| 能力 | HTTP | 实现文件 | API 类型 | 模型（代码常量 / 环境变量） | 触发方式 |
|------|------|-----------|----------|------------------------------|----------|
| **聊天** | `POST /api/chat` | [`apps/server/app/api/chat/route.ts`](apps/server/app/api/chat/route.ts) | Anthropic Messages API | **Layer1**：`claude-haiku-4-5-20251001`；**Layer2**：`claude-sonnet-4-6`。由 `analyzeDeepAnalysisNeed` 决定是否升级 Layer2（`deepAnalysis`）。 | [`sendChatMessage`](apps/mobile/lib/api.ts)；首页 Chat UI。 |
| **语音转写** | `POST /api/transcribe` | [`apps/server/app/api/transcribe/route.ts`](apps/server/app/api/transcribe/route.ts) | OpenAI Audio Transcriptions | `whisper-1` 或 `gpt-4o-mini-transcribe`（由表单字段 `model` 决定，移动端默认传 `gpt-4o-mini-transcribe`）。 | [`transcribeAudio`](apps/mobile/lib/api.ts)；日历 Add Health Record 录音。 |
| **资料上传 AI 分析** | `POST /api/profile-document-analyze` | [`apps/server/app/api/profile-document-analyze/route.ts`](apps/server/app/api/profile-document-analyze/route.ts) | OpenAI Chat Completions（含多模态图片 `image_url` / data URL） | 环境变量 **`PROFILE_DOC_MODEL`**，默认 **`gpt-5`**（见 `getProfileDocModel()`）。 | [`analyzeProfileDocumentUploads`](apps/mobile/lib/api.ts)；Documents / Profile 上传成功后异步调用。 |
| **症状关键词 + 严重度（元数据）** | `POST /api/health-record-meta` | [`apps/server/app/api/health-record-meta/route.ts`](apps/server/app/api/health-record-meta/route.ts) | Anthropic Messages（**无** tools / 聊天历史 / `chatContext`） | **`claude-haiku-4-5-20251001`**；用户消息仅为记录正文。 | [`generateSymptomMeta`](apps/mobile/lib/api.ts)；Pro 用户在 [`AddSymptomFab`](apps/mobile/components/calendar/AddSymptomFab.tsx) 提交手动记录时。 |

### 2.1 提示词与上下文（聊天）

- **System prompt**：[`buildSystemPrompt`](apps/server/lib/chatContext.ts)、[`buildBaseContext`](apps/server/lib/chatContext.ts)、[`buildFullContext`](apps/server/lib/chatContext.ts)（Layer2 时合并更长周期摘要与文档摘要）。
- **Tools**（Anthropic tool 定义）：`log_symptom`、`fetch_health_history`、`list_documents`、`fetch_document_detail` 等，见 [`chat/route.ts`](apps/server/app/api/chat/route.ts) 内常量（如 `LOG_SYMPTOM_TOOL`）。
- **执行逻辑**：多轮循环（`maxTurns` 约 5），处理 `tool_use` / `tool_result`；症状关键词在 `symptom_feeling` 类目下会经 [`normalizeKeywords`](apps/server/lib/symptomTaxonomy.ts) **本地**归一化（非 API）。

### 2.2 提示词（资料分析）

- 结构化 JSON 输出、分类、日期与 `items` 等说明均在 **`profile-document-analyze/route.ts`** 内拼接；解析见同文件 `parseOutput`。
- 图片经 `sharp` 缩放后送入视觉模型。

### 2.3 健康记录元数据（`generateSymptomMeta` → `/api/health-record-meta`）

- **服务端**：[`health-record-meta/route.ts`](apps/server/app/api/health-record-meta/route.ts) 内 `systemPromptSymptom` / `systemPromptMedication`；**user** 仅为 `description` 字符串（不含档案摘要）。需 **Pro**（`isPaidUser`，非生产可 `x-nvapp-mock-tier` 与 chat 一致）。
- **后处理**：症状类关键词经 [`normalizeKeywords`](apps/server/lib/symptomTaxonomy.ts) 与词表对齐；用药类不做词表归一。

---

## 3. 服务端内部 / 异步（按用户计费需能归因 `user_id`）

| 能力 | 实现 | API | 模型 | 触发 |
|------|------|-----|------|------|
| **文档上下文 · 全量聚合** | `refreshDocumentContextWithClient` in [`apps/server/lib/documentContext.ts`](apps/server/lib/documentContext.ts) | OpenAI `POST /v1/chat/completions` | 文档条数 **> 3** → **`gpt-4o`**；否则 **`gpt-4o-mini`** | `process-document-queue` 成功处理 `document_context` job；或全量刷新入口调用 `refreshDocumentContext`。 |
| **文档上下文 · 增量** | `incrementalRefreshDocumentContextWithClient` 同上文件 | OpenAI Chat Completions | 固定 **`gpt-4o-mini`** | [`profile-document-analyze`](apps/server/app/api/profile-document-analyze/route.ts) 在单条分析成功后调用。 |
| **Prompt 形态** | 同文件内模板字符串 | — | 要求输出 JSON：`docs_summary`、`risk_flags`（全量与增量两套 prompt）。 | — |

**队列说明**：[`supabase/functions/process-document-queue/index.ts`](supabase/functions/process-document-queue/index.ts) 消费 `summary_generation_queue` 中 `level = document_context` 的任务，调用共享逻辑（见下节 Edge 版 `_shared/documentContext.ts`）。

---

## 4. Supabase Edge Functions（Deno，多为定时 / 批处理）

运行需配置 **`OPENAI_API_KEY`**、**`ANTHROPIC_API_KEY`**（依函数而定），见各函数源码 `Deno.env.get`。

| 函数目录 | 共享模块 / 依赖 | 主要模型 | 用途简述 |
|----------|-----------------|----------|----------|
| [`weekly-summary`](supabase/functions/weekly-summary/index.ts) | [`_shared/summaryAi.ts`](supabase/functions/_shared/summaryAi.ts) | `SUMMARY_MODELS`：`gpt-4o` / `gpt-4o-mini`（见映射） | 周期健康摘要（周相关）。 |
| [`monthly-summary`](supabase/functions/monthly-summary/index.ts) | 同上 | 同上 | rolling / monthly / quarterly / biannual 等层级。 |
| [`backfill-summaries`](supabase/functions/backfill-summaries/index.ts) | 同上 | `backfill_*` → 多为 **`gpt-4o-mini`** | 历史摘要回填。 |
| [`generate-weekly-report`](supabase/functions/generate-weekly-report/index.ts) | Anthropic Messages；[`_shared/normalizeKeywords.ts`](supabase/functions/_shared/normalizeKeywords.ts) | 正文 **`claude-sonnet-4-6`**；关键词批处理 **`claude-haiku-4-5-20251001`** | 周报 HTML/内容生成（含关键词规范化）。 |
| [`generate-monthly-report`](supabase/functions/generate-monthly-report/index.ts) | 同上 | 同上 | 月报。 |
| [`process-document-queue`](supabase/functions/process-document-queue/index.ts) | [`_shared/documentContext.ts`](supabase/functions/_shared/documentContext.ts) | OpenAI：`gpt-4o` / `gpt-4o-mini`（与 server 版同源策略） | 异步重建 `user_document_context`。 |

### 4.1 共享：`summaryAi.ts`

- [`chatHealthSummary(kind, baseSystemPrompt, userContent, openaiApiKey)`](supabase/functions/_shared/summaryAi.ts)：统一 `chat/completions`，`SUMMARY_MODELS` 与 `SUMMARY_LENGTH`（`max_tokens`、字数提示）按 `kind` 分支。

### 4.2 共享：`normalizeKeywords.ts`

- 批量关键词规范化：Anthropic Haiku；与 `generate-*-report` 配合。

---

## 5. 本地脚本 / 运维（非线上用户请求）

以下通常用 **Node 环境变量** 中的 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`，**不经过** App 用户 Bearer，计费归因需在脚本层或任务参数中自行区分。

| 脚本 / 模块 | 说明 |
|-------------|------|
| [`scripts/backfill-reports.ts`](scripts/backfill-reports.ts) | Anthropic（如 `claude-sonnet-4-6`），报告类回填。 |
| [`scripts/backfill-weekly-snapshot.ts`](scripts/backfill-weekly-snapshot.ts) | OpenAI `gpt-4o-mini` 等。 |
| [`scripts/debug-weekly-summary.ts`](scripts/debug-weekly-summary.ts) | 调试环境变量与 weekly 流水线。 |
| [`apps/server/lib/taxonomyDb.ts`](apps/server/lib/taxonomyDb.ts) | Anthropic Haiku（与 Edge `_shared/normalizeKeywords` 思路类似）；多用于 **DB/词表** 相关脚本（如 [`scripts/backfill-reports.ts`](scripts/backfill-reports.ts) 引用路径），非日常 App 请求。 |

---

## 6. 实现「按用户 token 限额」时的提示

1. **易挂钩的同步入口**（已能解析 `user_id`）：`POST /api/chat`、`POST /api/transcribe`、`POST /api/profile-document-analyze`、`POST /api/health-record-meta`（与聊天 **分开**计量）。
2. **异步与队列**：必须在 job 或调用链上保留 **`user_id`**，才能将 `process-document-queue`、Edge 定时任务等用量摊到用户（若产品要求如此）。
3. **健康记录元数据**已独立路由，**不再**占用聊天条数或 `chat_messages`。
4. **供应商差异**：OpenAI 与 Anthropic 的 **token 统计字段**不同（如 Anthropic response `usage`）；若要做统一「点数」，需在网关层归一化。

---

## 7. 文档维护

- 新增 API 或 Edge Function 时，请同步更新本文件。
- 模型名以代码与环境变量为准；默认模型可能随部署变更。
