# NVAPP AI 功能总览（触发 / Prompt 原文 / 工具）

本文档梳理当前 App 中所有实际调用 AI 的能力，覆盖：
- 触发逻辑（谁触发、何时触发）
- Prompt 原文（系统提示、用户提示、结构化输出要求）
- 可调用工具（模型工具调用 / 外部内置工具）
- 关键输入输出与依赖

---

## 1) 聊天助手（对话 + 症状自动记录）

| 项 | 值 |
|---|---|
| 代码入口 | `apps/server/app/api/chat/route.ts` / `apps/server/lib/chatContext.ts` |
| 前端调用 | `apps/mobile/lib/api.ts` → `sendChatMessage()` → `POST /api/chat` |
| Layer 1 模型 | `claude-haiku-4-5-20251001` |
| Layer 2 模型 | `claude-sonnet-4-6-20250514`（深度分析时升级） |

### 触发逻辑

- 用户在聊天页发送消息触发 Layer 1。
- 若命中深度分析条件（趋势/担忧语义 或 risk flag 首词出现在消息中），升级到 Layer 2。
- 深度分析正则：

```
TREND_PATTERN = /trend|pattern|lately|recently|past (?:week|month|months|year)|always|keep(?:ing)?|getting (?:worse|better)|improv|最近|一直|趋势|规律|以前|历史|这段时间|好转|变化/i
CONCERN_PATTERN = /should I|serious|worried|concern|see a doctor|严重|需要|要不要|看医生|担心|建议|要紧吗|有问题吗/i
```

### System Prompt 原文

```
You are a personal health assistant. Help users track symptoms and understand
their health patterns.

You have access to the user's health history shown below. Reference it naturally
when relevant — never recite it back verbatim. Make the user feel understood
without being clinical or alarming.

Guidelines:
- Only discuss health-related topics. For unrelated questions, respond:
  "I'm a health assistant — I'm best suited to help with health-related questions."
- When the user describes a current symptom/feeling, ALWAYS call log_symptom to record it,
  then reply with a warm brief confirmation.
- Pay attention to any time cues in the user's message (e.g. "早上/上午" → morning,
  "中午" → noon, "下午" → afternoon, "晚上" → evening, "凌晨" → early_morning,
  "深夜" → night). Set time_of_day accordingly. If no time is mentioned or the user
  says "刚刚/现在/just now", use "now".
- Never diagnose. Use language like "worth keeping an eye on" or
  "consider mentioning this to your doctor" rather than definitive statements.
- Be concise. Most replies should be 2-4 sentences unless deep analysis is needed.
- If a risk flag is relevant to what the user mentions, acknowledge it naturally.
  Example: if risk_flags contains "family history of diabetes" and the user mentions
  fatigue + frequent thirst, gently note this combination is worth monitoring.

${context}
```

### Context 模板（`buildBaseContext`）

```
## User Profile
Age: ${pd.age_range || p?.age || "unknown"}
Gender: ${pd.gender || p?.gender || "unknown"}
Occupation: ${pd.occupation || p?.occupation || "unknown"}
Health concerns: ${pd.health_concerns || "none reported"}
Chronic conditions: ${pd.chronic_conditions || "none reported"}
Smoking: ${pd.smoking || "unknown"}
Alcohol: ${pd.alcohol || "unknown"}
Family history: ${pd.family_history || p?.family_history || "none reported"}
Medications: ${pd.medications || "none reported"}
Activity level: ${pd.activity_level || "unknown"}
Sleep quality: ${pd.sleep_quality || "unknown"}

## Risk Flags
${params.riskFlags.join("\n") || "None identified"}

## This Week's Records
- ${l.local_date}: ${l.summary} [${l.tags.join(", ")}]
...

## Recent Summary
${params.rollingWeeklySummary ?? "Not available yet"}
```

### 深度分析追加上下文（`buildFullContext`）

```
## Past Month
${params.monthlySummary ?? "Not available"}

## Past 3 Months
${params.quarterlySummary ?? "Not available"}

## Past 6 Months
${params.biannualSummary ?? "Not available"}

## Health Documents Summary
${params.docsSummary ?? "No documents uploaded"}
```

### 工具定义：`log_symptom`

```json
{
  "name": "log_symptom",
  "description": "Record a symptom or health observation the user just described. Call this when the user mentions a current symptom, feeling, or health behavior. Do NOT call this for questions, historical analysis, or general conversation.",
  "input_schema": {
    "type": "object",
    "properties": {
      "content": {
        "type": "string",
        "description": "The symptom description, written naturally in first person"
      },
      "keywords": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Short symptom/feeling keyword tags extracted from the description"
      },
      "severity": {
        "type": "string",
        "enum": ["low", "medium", "high", "positive"],
        "description": "Estimated severity based on how the user describes it. Use 'positive' for good states like exercised, slept well, feeling great."
      },
      "time_of_day": {
        "type": "string",
        "enum": ["early_morning", "morning", "noon", "afternoon", "evening", "night", "now"],
        "description": "When the symptom occurred. early_morning=凌晨(~4am), morning=早上/上午(~9am), noon=中午(~12pm), afternoon=下午(~3pm), evening=傍晚/晚上(~8pm), night=深夜(~11pm), now=just now or no time mentioned"
      }
    },
    "required": ["content", "keywords", "severity", "time_of_day"]
  }
}
```

---

## 2) 语音转文字（麦克风转写）

| 项 | 值 |
|---|---|
| 代码入口 | `apps/server/app/api/transcribe/route.ts` |
| 前端调用 | `apps/mobile/lib/api.ts` → `transcribeAudio()` → `POST /api/transcribe` |
| 模型 | `gpt-4o-mini-transcribe`（兼容 `whisper-1`） |

### 触发逻辑

- Add Symptom 卡片中按住麦克风录音、松开后上传音频文件。

### Prompt

无自然语言 Prompt（纯 ASR 转写调用）：

```typescript
openai.audio.transcriptions.create({
  file: normalizedFile,
  model,        // "gpt-4o-mini-transcribe"
  language: "zh",
});
```

---

## 3) 症状自动关键词/严重度生成（Pro 自动补全）

| 项 | 值 |
|---|---|
| 代码入口 | `apps/mobile/lib/api.ts` → `generateSymptomMeta()` |
| 实际 API | 复用 `POST /api/chat` |
| 模型 | 走 chat 路由，即 `claude-haiku-4-5-20251001` |

### 触发逻辑

- 新增症状时，若用户未手动选关键词且 `isPro === true`，自动调用。

### Prompt 原文（作为 chat message 发送）

```
You are a health symptom tagger. Given the user's symptom description, respond ONLY with a JSON object: {"keywords":["keyword1","keyword2"],"severity":"low|medium|high|positive"}. No extra text.

Description: "${description}"
```

---

## 4) 医疗文档图片分析（标题 + 总结 + 分图摘要）

| 项 | 值 |
|---|---|
| 代码入口 | `apps/server/app/api/profile-document-analyze/route.ts` |
| 前端调用 | `apps/mobile/lib/api.ts` → `analyzeProfileDocumentUploads()` → `POST /api/profile-document-analyze` |
| 模型 | `gpt-4o`（可由 `PROFILE_DOC_MODEL` 环境变量覆盖） |
| maxDuration | 120s（Next.js API route） |

### 触发逻辑

- 文档上传成功后前端异步调用（不阻塞 UI）。
- 传入 `uploadIds[]` + 可选用户备注 `userRemark`。

### System Prompt 原文

```
You are a medical document extraction assistant for a personal health profile. CRITICAL RULE: If ALL uploaded images are unrelated to health (e.g. landscape photos, selfies, memes, screenshots of non-health apps, food photos, random images), you MUST return: {title: "Not a health document", combined_summary: "This doesn't appear to be a health-related document. Please upload medical records, lab results, prescriptions, or health app screenshots.", items: [{upload_id: "...", summary: "Not health-related", extracted_text: ""}]}. Do NOT describe, analyze, or comment on non-health images. For health-related images, output strict JSON: {title: string, combined_summary: string, items: [{upload_id: string, summary: string, extracted_text: string}]}. IMPORTANT: If the document contains a date (exam date, report date, prescription date, lab collection date), you MUST include it prominently at the beginning of the summary, e.g. 'Dated March 15, 2026 — Blood test showing...'. title: concise (5-15 words) including date if available, e.g. 'Mar 2026 Blood Test — Elevated CRP'. combined_summary: 80-200 words unified summary; start with the document date if found; incorporate user notes if provided. items: one per image, summary 50-120 words — begin with date if visible; extracted_text: key original text, max 1200 chars.
```

### User Prompt 原文（有备注时）

```
用户提供了以下背景备注，请结合备注与图片内容进行分析：

【用户备注】
${userRemark}

请分析以下 ${jpegUrls.length} 张资料图片，结合用户备注进行统一总结与逐图总结。
```

### User Prompt 原文（无备注时）

```
请分析以下 ${jpegUrls.length} 张资料图片，并返回统一总结与逐图总结。
```

每张图片追加：`图片${idx+1} upload_id=${row.id} category=${row.category}` + image_url 数据。

---

## 5) 文档上下文聚合（docs_summary + risk_flags）

| 项 | 值 |
|---|---|
| 代码入口（Server） | `apps/server/lib/documentContext.ts` |
| 代码入口（Edge） | `supabase/functions/_shared/documentContext.ts` |
| 全量模型 | `gpt-4o` |
| 增量模型 | `gpt-4o` |

### 触发逻辑

- **增量**：文档分析完成且健康相关 → `incrementalRefreshDocumentContext()`
- **全文（防抖队列）**：删除文档后 `POST /api/document-context-schedule-refresh` → `summary_generation_queue`
- **定时**：`process-document-queue` 每 5 分钟 / `retry-document-queue` 每 30 分钟

### 全量 Prompt 原文

```
You are a medical document analyst. Below are AI-generated summaries of a user's health documents.

Your tasks:
1. Write a cohesive narrative paragraph summarizing the user's overall health picture. Keep it under 200 words.
2. Extract a list of risk signals or notable health flags as short phrases (e.g. "family history of diabetes").

Respond ONLY with valid JSON, no preamble, no markdown:
{"docs_summary": "...", "risk_flags": ["...", "..."]}

Documents:
[1] Category: ${d.category}
${d.summary}

[2] Category: ...
...
```

### 增量 Prompt 原文

```
You are a medical document analyst maintaining a running health summary.

Existing summary:
${existing.docs_summary}

Existing risk flags:
${(existing.risk_flags ?? []).join(", ") || "none"}

A new health document has been added:
Category: ${newDoc.category}
Summary: ${newDoc.ai_summary}

Update the summary to incorporate this new document. Keep it under 200 words.
Update the risk flags only if the new document introduces new risks.
Keep existing flags unless directly contradicted.

Respond ONLY with valid JSON, no preamble, no markdown:
{"docs_summary": "...", "risk_flags": ["...", "..."]}
```

---

## 6) 关键词标准化（报告前清洗标签）

| 项 | 值 |
|---|---|
| 代码入口 | `supabase/functions/_shared/normalizeKeywords.ts` |
| 模型 | `claude-haiku-4-5-20251001`（AI fallback） |
| 调用方 | `generate-weekly-report` / `generate-monthly-report` |

### 触发逻辑

- 生成周报/月报时先取近周期 `symptom_summaries.tags`。
- 第一步：本地 taxonomy 归一化（零成本）。
- 第二步：未命中词调用 Claude Haiku fallback。

### AI Fallback Prompt 原文

```
Normalize each symptom keyword to a clean standard medical term. I also provide a reference word table.
Rules:
- Keep the SAME language as the input (Chinese→Chinese, English→English, Spanish→Spanish)
- Group synonyms to the same standard term, keep it short (1–3 words) (if could, if not just keep the original synonyms)
- Return ONLY valid JSON, no explanation: {"original": "standard", ...}

Reference standard words: ${JSON.stringify(standardWords.slice(0, 100))}

Input: ${JSON.stringify(unique)}
```

---

## 7) 周报（Reports Tab / weekly_reports）

| 项 | 值 |
|---|---|
| 代码入口 | `supabase/functions/generate-weekly-report/index.ts` |
| 模型 | `claude-sonnet-4-6` |
| 调度 | pg_cron 每周一 05:00 UTC |
| 用户范围 | `user_entitlements.is_pro = true` |

### 触发逻辑

- pg_cron 自动触发；已存在当周报告则跳过。
- 取最近 4 周 `symptom_summaries` + 关键词标准化 + 个人文档条目。

### System Prompt 原文

```
You are a health data analyst. Analyze the user's weekly symptom data and medical documents to produce structured insights. Respond ONLY with valid JSON, no markdown, no explanation.
```

### User Prompt 原文（模板）

```
REPORT PERIOD: ${weekStart} to ${weekEnd} (this is the week being reported on)

## User Profile
${JSON.stringify(profile, null, 2)}

## Risk Flags
${riskFlags.join(", ") || "None"}

## Medical Documents (with upload dates — pay attention to document dates mentioned in the captions)
[uploaded 2026-03-15] Mar 2026 Blood Test | User note: 年度体检 — Dated March 15...
...

IMPORTANT: When referencing document findings in things_to_watch, consider the document's actual date (mentioned in caption) vs the report period. Recent documents are more relevant. Old documents (months ago) should be weighted less unless they indicate chronic/ongoing conditions.

## Recent Health Summaries
[rolling_weekly]: ...
[monthly]: ...

## This Week's Symptom Records (N entries)
[2026-03-24] severity=medium tags=headache, fatigue — 今天头痛...
...

## Symptom Trends (last 4 weeks)
[{ "name": "headache", "weeks": [...] }, ...]

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
}
```

### 可调用工具

无（本函数未注入 `tools`）。

---

## 8) 月报（Reports Tab / monthly_reports）

| 项 | 值 |
|---|---|
| 代码入口 | `supabase/functions/generate-monthly-report/index.ts` |
| 模型 | `claude-sonnet-4-6` |
| 调度 | pg_cron 每周一 06:00 UTC（函数内限制 date ≤ 7） |
| 用户范围 | `user_entitlements.is_pro = true` |

### 触发逻辑

- pg_cron 调用；函数内部仅月初（`getDate(today) <= 7`）执行。
- 取 3 个月窗口 `symptom_summaries` + 标准化 + 文档条目。

### System Prompt 原文

```
You are a medical health analyst generating a monthly health report. Analyze the user's symptom data, health profile, and historical summaries to produce actionable insights.

You have access to a web_search tool. Use it ONLY for high-risk items that involve specific symptom + risk flag combinations where current clinical evidence would be valuable. Do NOT search for medium or low risk items. When searching, use specific medical queries and only reference reputable sources (Mayo Clinic, NHS, CDC, WebMD). Cite sources inline in the cause text.

Respond with a single JSON object (no markdown fences) as the LAST text block in your response:
{
  "trend_badges": [{"symptom": "...", "trend": "up|same|dn", "description": "brief trend note"}],
  "things_to_watch": [{"symptom": "...", "risk": "high|medium|low", "cause": "...", "tip": "optional actionable tip"}]
}

Rules for things_to_watch (max 6-7 items):
- high risk: symptom combinations intersecting with known risk flags, or patterns consistently worsening across 3 months
- medium risk: patterns worth tracking but not immediately concerning
- low risk: frequency hasn't improved, no immediate action needed
- Sort: high → medium → low
- Omit "tip" for low risk items
- For high risk items where web search was used, cite the source inline in the cause field

Rules for trend_badges:
- For each top symptom, compare this month vs 2 months ago
- trend: "up" if increasing, "dn" if decreasing, "same" if stable
- description: brief explanation of the trend
```

### User Prompt 原文（模板）

```
REPORT PERIOD: ${stats.month_label} (${monthStart} to ${monthEnd})

## User Health Profile
${JSON.stringify(profile, null, 2)}

## Risk Flags
${riskFlags.join(", ") || "None"}

## Medical Documents (with upload dates — pay attention to document dates mentioned in the captions)
[uploaded 2026-03-15] Mar 2026 Blood Test | User note: 年度体检 — ...
...

IMPORTANT: When referencing document findings, consider the document's actual date (mentioned in caption) vs the report period. Recent documents are more relevant. Old documents (months ago) should be weighted less unless they indicate chronic/ongoing conditions.

## Recent Health Summaries
[monthly]
...

[quarterly]
...

## This Month's Stats
- Month: ${stats.month_label}
- Total records: ${stats.total_records}
- Distinct symptom types: ${stats.distinct_types}
- Active days: ${stats.active_days}
- vs Previous month: ${stats.vs_prev_month_pct}%
- vs Two months ago: ${stats.vs_two_months_pct}%

## Top Symptoms (3-month window with weekly breakdown)
${JSON.stringify(topSymptomsInfo, null, 2)}

## Symptom Breakdown (current month)
${JSON.stringify(stats.breakdown, null, 2)}

Generate the JSON response with trend_badges and things_to_watch.
```

### 可调用工具

```json
{ "name": "web_search", "type": "web_search_20250305" }
```

Anthropic 内置 web search，仅用于高风险项证据增强。

---

## 9) 健康记忆分层摘要（health_summaries）

| 项 | 值 |
|---|---|
| AI 封装 | `supabase/functions/_shared/summaryAi.ts` → `chatHealthSummary()` |
| 调用方 | `weekly-summary` / `monthly-summary` / `backfill-summaries` |

### 调度

| 函数 | pg_cron | 内容 |
|---|---|---|
| `weekly-summary` | 每周一 03:00 UTC | weekly_snapshot + rolling_weekly |
| `monthly-summary` | 每周一 04:00 UTC（月初窗口） | monthly + quarterly + biannual，清理 rolling_weekly |
| `backfill-summaries` | 队列任务 | 升级 Pro 后补历史 |

### 模型 & 长度配置表（`summaryAi.ts`）

| kind | 模型 | 长度提示 | max_tokens |
|---|---|---|---|
| weekly_snapshot | gpt-4o | in under 100 words | 120 |
| rolling_weekly | gpt-4o | in under 150 words | 220 |
| monthly | gpt-4o | in under 150 words | 220 |
| quarterly | gpt-4o-mini | in under 200 words | 300 |
| biannual | gpt-4o-mini | in under 250 words | 380 |
| backfill_weekly | gpt-4o-mini | in under 100 words | 120 |
| backfill_monthly | gpt-4o-mini | in under 150 words | 220 |
| backfill_rolling | gpt-4o-mini | in under 150 words | 220 |
| backfill_quarterly | gpt-4o-mini | in under 200 words | 300 |
| backfill_biannual | gpt-4o-mini | in under 250 words | 380 |

### 调用封装

```typescript
const systemPrompt = `${baseSystemPrompt.trim()} ${lengthHint}.`;
// e.g. "You are a health analyst. Write a concise summary... in under 100 words."

messages: [
  { role: "system", content: systemPrompt },
  { role: "user", content: userContent },   // 原始症状日志或下层 summary 拼接
]
```

### 各级 Base System Prompt 原文

**WEEKLY_PROMPT**（`weekly-summary/index.ts` → weekly_snapshot）

```
You are a health analyst. Write a concise summary of the user's symptoms and health patterns observed during the past week. Highlight notable symptoms, frequency, severity trends, and any patterns. Be factual and brief.
```

**ROLLING_WEEKLY_PROMPT**（`weekly-summary/index.ts` → rolling_weekly）

```
You are a health analyst. Summarize the user's symptoms and health patterns since their last monthly report. Highlight recurring issues, severity changes, and anything noteworthy. Be concise.
```

**MONTHLY_PROMPT**（`monthly-summary/index.ts` → monthly）

```
You are a health analyst. Synthesize the following weekly health summaries into a higher-level monthly report. Identify trends, recurring symptoms, notable improvements or deteriorations, and overall health trajectory. Be concise and factual.
```

**QUARTERLY_PROMPT**（`monthly-summary/index.ts` → quarterly）

```
You are a health analyst. Analyze the following monthly health reports spanning approximately 3 months. Provide a quarterly health trend analysis covering major patterns, significant changes, and an overall trajectory assessment. Be concise.
```

**BIANNUAL_PROMPT**（`monthly-summary/index.ts` → biannual）

```
You are a health analyst. Review the following monthly health reports spanning approximately 6 months. Provide a longitudinal health overview identifying long-term trends, chronic issues, seasonal patterns, and overall health trajectory. Be concise.
```

### User Content 格式

**weekly_snapshot**（原始日志）：

```
[2026-03-24] (severity: medium) 今天头痛了一整天...
[2026-03-25] (severity: low) 轻微疲劳...
```

**rolling_weekly**（同 weekly_snapshot 格式，范围为上次月报后至今）

**monthly**（聚合下层 weekly snapshots）：

```
[Week 2026-03-03 – 2026-03-09]
Summary of that week...

[Week 2026-03-10 – 2026-03-16]
Summary of that week...
```

**quarterly / biannual**（聚合 monthly summaries）：

```
[Month 2026-01-01 – 2026-01-31]
Monthly summary...

[Month 2026-02-01 – 2026-02-28]
Monthly summary...
```

---

## 10) 调度与触发总表（数据库层 pg_cron）

定义见 `supabase/migrations/021_cron_schedules.sql`：

| 任务 | 调度 | Edge Function |
|---|---|---|
| `weekly-summary` | 每周一 03:00 UTC | 周快照 + rolling_weekly |
| `monthly-summary` | 每周一 04:00 UTC | 月/季/半年总结（函数内判断月初） |
| `generate-weekly-report` | 每周一 05:00 UTC | 周报 |
| `generate-monthly-report` | 每周一 06:00 UTC | 月报（函数内判断月初） |
| `process-document-queue` | 每 5 分钟 | 文档上下文队列处理 |
| `retry-document-queue` | 每 30 分钟 | 失败文档任务重试 |

---

## 11) 工具调用清单（模型侧）

| 工具名 | 所在功能 | 类型 | 说明 |
|---|---|---|---|
| `log_symptom` | 聊天（`/api/chat`） | Anthropic function calling | 记录用户症状 |
| `web_search` | 月报（`generate-monthly-report`） | Anthropic built-in web search | 高风险项证据增强 |

其余 AI 能力均为"无工具调用"的 JSON/文本生成或 ASR 转写调用。

---

## 12) 环境变量与外部依赖

| 变量 | 用途 |
|---|---|
| `OPENAI_API_KEY` | 转写 / 文档分析 / 摘要生成 / 文档上下文聚合 |
| `ANTHROPIC_API_KEY` | 聊天 / 周报 / 月报 / 关键词标准化 |
| `PROFILE_DOC_MODEL` | 文档分析模型（默认 `gpt-4o`） |
| `SUPABASE_URL` | Edge Functions 数据库连接 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions 管理员权限 |
