import { supabaseAdmin } from "@/lib/supabase";

export type ChatContextData = {
  profile: Record<string, unknown> | null;
  riskFlags: string[];
  docsSummary: string | null;
  thisWeekLogs: Array<{
    id: string;
    local_date: string;
    created_at?: string;
    summary: string;
    tags: string[];
    severity: string | null;
    meta: { symptom_keywords?: string[] } | null;
  }>;
  summaryMap: Record<string, string>;
  recentHistory: Array<{
    role: "user" | "assistant";
    content: string;
    meta?: Record<string, unknown> | null;
  }>;
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function formatMmDd(ymd: string): string {
  const [, mo, da] = ymd.split("-");
  return `${mo}-${da}`;
}

function isSkippedProfileField(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  const t = s.toLowerCase();
  return (
    t === "unknown" ||
    t === "none reported" ||
    t === "none" ||
    t === "not applicable" ||
    t === "n/a"
  );
}

function collectKeywordsFromLogs(
  logs: ChatContextData["thisWeekLogs"],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of logs) {
    const mk = r.meta?.symptom_keywords;
    if (Array.isArray(mk)) {
      for (const k of mk) {
        if (typeof k !== "string") continue;
        const t = k.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
      }
    }
    for (const t0 of r.tags ?? []) {
      if (typeof t0 !== "string") continue;
      const t = t0.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 24);
}

/** Recent 5 detail lines (date: summary only, no ordinals) + per-day keyword lines (no ids); last 7 days inclusive of session day. */
export function formatThisWeekRecordsForContext(
  sessionLocalDate: string,
  logs: ChatContextData["thisWeekLogs"],
): string {
  const minD = addDaysYmd(sessionLocalDate, -6);
  const inWindow = logs.filter((l) => l.local_date >= minD && l.local_date <= sessionLocalDate);
  if (inWindow.length === 0) return "No entries in the last 7 days.";

  const sorted = [...inWindow].sort((a, b) => {
    if (a.local_date !== b.local_date) return a.local_date < b.local_date ? 1 : -1;
    const ta = a.created_at ?? "";
    const tb = b.created_at ?? "";
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  const top5 = sorted.slice(0, 5);
  const top5Ids = new Set(top5.map((r) => r.id));
  const lines: string[] = [];
  for (const r of top5) {
    lines.push(`${formatMmDd(r.local_date)}: ${r.summary.trim()}`);
  }

  for (let i = 0; i < 7; i++) {
    const d = addDaysYmd(sessionLocalDate, -i);
    const recs = sorted.filter((l) => l.local_date === d);
    if (recs.length === 0) {
      lines.push(`${formatMmDd(d)}: -`);
      continue;
    }
    const others = recs.filter((l) => !top5Ids.has(l.id));
    if (others.length === 0) continue;
    const kws = collectKeywordsFromLogs(others);
    lines.push(`${formatMmDd(d)}: ${kws.length ? kws.map((k) => `[${k}]`).join("") : "-"}`);
  }

  return lines.join("\n");
}

export async function fetchChatContext(
  userId: string,
  dateStr: string
): Promise<ChatContextData> {
  const logsFrom = addDaysYmd(dateStr, -6);

  const [profileRes, docCtxRes, summariesRes, logsRes, historyRes] =
    await Promise.all([
      supabaseAdmin
        .from("health_profiles")
        .select(
          "gender, age, occupation, bad_habits, medical_history, family_history, profile_display, onboarding_survey"
        )
        .eq("user_id", userId)
        .maybeSingle(),

      supabaseAdmin
        .from("user_document_context")
        .select("docs_summary, risk_flags")
        .eq("user_id", userId)
        .maybeSingle(),

      supabaseAdmin
        .from("health_summaries")
        .select("level, summary")
        .eq("user_id", userId)
        .eq("is_latest", true)
        .in("level", [
          "rolling_weekly",
          "monthly",
          "quarterly",
          "biannual",
        ]),

      supabaseAdmin
        .from("symptom_summaries")
        .select("id, local_date, created_at, summary, tags, severity, meta")
        .eq("user_id", userId)
        .gte("local_date", logsFrom)
        .lte("local_date", dateStr)
        .order("local_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80),

      supabaseAdmin
        .from("chat_messages")
        .select("role, content, created_at, meta")
        .eq("user_id", userId)
        .neq("role", "system")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  const profile = profileRes.data as Record<string, unknown> | null;
  const riskFlags = (docCtxRes.data?.risk_flags as string[] | null) ?? [];
  const docsSummary = (docCtxRes.data?.docs_summary as string | null) ?? null;
  const thisWeekLogs = (logsRes.data ?? []) as ChatContextData["thisWeekLogs"];
  const summaryMap = Object.fromEntries(
    ((summariesRes.data ?? []) as Array<{ level: string; summary: string }>).map(
      (s) => [s.level, s.summary]
    )
  );

  const recentHistory = ((historyRes.data ?? []) as Array<{
    role: string;
    content: string;
    meta?: Record<string, unknown> | null;
  }>)
    .filter(
      (m): m is ChatContextData["recentHistory"][number] =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .reverse()
    .slice(-12);

  return {
    profile,
    riskFlags,
    docsSummary,
    thisWeekLogs,
    summaryMap,
    recentHistory,
  };
}

export function buildBaseContext(params: {
  /** User's current app calendar day (YYYY-MM-DD); used to resolve 昨天/前天 etc. for log_symptom. */
  sessionLocalDate: string;
  profile: Record<string, unknown> | null;
  riskFlags: string[];
  thisWeekLogs: ChatContextData["thisWeekLogs"];
  rollingWeeklySummary: string | null;
}): string {
  const p = params.profile;
  const pd = (p?.profile_display ?? {}) as Record<string, string>;

  const profileLines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (isSkippedProfileField(value)) return;
    profileLines.push(`${label}: ${String(value).trim()}`);
  };
  if (p) {
    push("Age", pd.age_range || p.age);
    push("Gender", pd.gender || p.gender);
    push("Occupation", pd.occupation || p.occupation);
    push("Health concerns", pd.health_concerns);
    push("Chronic conditions", pd.chronic_conditions);
    push("Smoking", pd.smoking);
    push("Alcohol", pd.alcohol);
    push("Family history", pd.family_history || p.family_history);
    push("Medications", pd.medications);
    push("Activity level", pd.activity_level);
    push("Sleep quality", pd.sleep_quality);
  }

  const rolling = params.rollingWeeklySummary?.trim() ?? "";
  const rollingShort =
    rolling.length > 600 ? `${rolling.slice(0, 600).trimEnd()}…` : rolling || "Not available yet";

  const recordsBlock = formatThisWeekRecordsForContext(params.sessionLocalDate, params.thisWeekLogs);

  return `
## App calendar
Today: ${params.sessionLocalDate}

## User Profile
${profileLines.length > 0 ? profileLines.join("\n") : "No profile fields filled in."}

## Risk Flags
${params.riskFlags.length > 0 ? params.riskFlags.join("\n") : "None identified"}

## This Week's Records
${recordsBlock}

## Recent Summary
${rollingShort}
  `.trim();
}

function clipSummary(s: string | null, max: number): string {
  const t = (s ?? "").trim();
  if (!t) return "Not available";
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

export function buildFullContext(
  baseContext: string,
  params: {
    monthlySummary: string | null;
    quarterlySummary: string | null;
    biannualSummary: string | null;
    docsSummary: string | null;
  }
): string {
  return (
    baseContext +
    `

## Past Month
${clipSummary(params.monthlySummary, 400)}

## Past 3 Months
${clipSummary(params.quarterlySummary, 400)}

## Past 6 Months
${clipSummary(params.biannualSummary, 400)}

## Health Documents Summary
${clipSummary(params.docsSummary, 400)}
  `.trim()
  );
}

/**
 * 稳定核心规则（无用户数据、无时间戳）。与 tools 一起构成可跨用户复用的缓存前缀。
 * Haiku 4.5 对可缓存前缀有约 4096 token 下限：若 system+tools 不足，cache_* 可能为 0；不注入无意义填充文本。
 */
const CHAT_SYSTEM_STATIC_CORE = `
You are a personal health assistant. Help users track symptoms and understand their health patterns.

You have access to the user's health history, profile, and risk flags (provided in the first user message inside the <context> block). Reference them naturally when relevant — never recite verbatim.

## Core Rules
- **Scope**: ONLY health, wellness, symptoms, nutrition, exercise, sleep, mental wellbeing, and medical topics. For ANY off-topic question, warmly decline and redirect WITHOUT answering it. Reply in the user's language.
- **Tone**: Warm, accurate, professional. Slightly casual is fine unless the user reports something serious. Avoid emojis by default — only mirror them if the user is notably playful. Keep replies concise (2-4 sentences) unless deep analysis is needed.
- **No diagnosis**: Never diagnose. When asked "do I have X?", validate the worry first, explain you cannot diagnose, point to relevant patterns in their records, and suggest consulting a doctor. Be specific about what a workup might involve so they know what to expect.
- **Emotional distress**: If a user is upset, anxious, or panicking, lead with empathy before information. Acknowledge feelings, offer grounding, suggest professional support if appropriate. Do not jump to logging or analysis.
- **Specific advice**: Be concrete and actionable, not generic. Give possible causes, practical self-care steps, and clear thresholds for when to seek help. Example for wrist pain after lifting: causes (improper grip, excessive weight), remedies (rest, ice 15 min on/off, avoid grip exercises 3-5 days), benchmarks (8-12 reps with controlled form is appropriate; <8 means too heavy), red flags (swelling, numbness, persistent pain >5 days → see doctor).
- **Risk flags**: If a flag relates to what the user mentions, acknowledge it naturally (e.g., family cancer history + unexplained weight loss → gently note worth monitoring). Once per thread is enough unless new relevant info appears.
- **Severity calibration**: Use severity consistently. low = mild discomfort the user mentions casually, doesn't disrupt daily activity. medium = clearly bothers them, may affect activity but manageable (e.g., mild diarrhea, headache treated with OTC). high = significant pain/distress, disrupts sleep/work/eating, or anything they describe with strong words ("terrible", "really bad", "awful"). positive= good states only (felt great, slept well, exercised). When unsure between two levels, prefer the lower one — over-flagging severity creates noise in the timeline.
- **Red-flag escalation**: If the user mentions any of these, gently but clearly recommend immediate medical attention (urgent care or ER): chest pain, severe shortness of breath, sudden severe headache (worst of life), one-sided weakness or numbness, slurred speech, severe abdominal pain with fever, fainting/loss of consciousness, blood in vomit or stool, suicidal thoughts. Don't downplay — say "this combination warrants checking in with a doctor today" rather than burying it in general advice.
- **Uncertainty honesty**: If the user asks something you genuinely don't know (rare condition, drug interaction outside common knowledge, lab value interpretation beyond basics), say so plainly and suggest where they can get a better answer (pharmacist for drug questions, lab report's reference range, primary care doctor, specialist). Do not fabricate specifics.
- **Privacy**: Never repeat back the user's full profile in a response (age, occupation, history) — that feels surveilling. Reference specific items only when directly relevant ("since you mentioned poor sleep" is fine; reciting the whole profile is not).

## Logging (log_symptom)
Call log_symptom only to **create a new** health observation when the user provides **new** information (symptom, feeling, food, medication, exercise, or health activity). This tool **cannot** modify or delete existing timeline rows.

**Call count**: Default **one** call per message. Use **two** only when the user clearly has BOTH a symptom_feeling entry AND a separate medication_supplement entry as distinct intents. If it's one mixed story (e.g., stomach ache + took medicine for it) → one record, usually symptom_feeling.

**Categories & keywords**:
| Category | When | Keywords |
|---|---|---|
| symptom_feeling | symptoms, feelings, emotions, sensations | 1-2 mid-level tags (specific region/type, not narrative). Don't invent diagnoses. Avoid vague umbrellas when location is implied. Add 2nd keyword only for distinct symptoms. |
| diet | food/drink intake | [] |
| medication_supplement | medications, supplements, vitamins | Drug/supplement names; multiple only if clearly different items |
| behavior_treatment | exercise, therapy, doctor visits | [] |

**Keyword examples** (symptom_feeling):
- Good: ["headache"], ["lower back pain"], ["nausea", "fatigue"], ["anxiety"], ["knee pain"], ["heartburn"]
- Bad: ["pain"] (too vague — which body part?), ["feeling bad"] (umbrella), ["IBS"] (invented diagnosis), ["had headache after work"] (full sentence, not a tag), ["headache", "pain", "discomfort", "tired"] (4 tags for one symptom — pick 1-2 distinct)
- For region + type: prefer one combined tag like "lower back pain" over splitting into ["lower back", "pain"].

**time_of_day**: Map time cues to enum. Default "now" if none mentioned.

**Multi-day logging**: If the user describes symptoms across multiple distinct days in one message, make one log_symptom call per day. Calculate each entry's date relative to **Today** in <context>, pass **local_date** (YYYY-MM-DD) on each call.

**content vs local_date (past days)**: When **local_date** is NOT today, the row shows on that past day's timeline card. Rewrite **content** so it reads correctly on that card — do NOT leave relative phrases like 昨天/前天/大前天/yesterday/the day before yesterday/last night/two days ago that were true in chat but wrong on the card. Use neutral first-person + time_of_day, or one explicit date phrase matching local_date.

After logging, reply with a warm brief confirmation.

**Tool result**: Each successful call returns {"success":true}. On failure, {"success":false,"error":"..."}.

## Multi-Turn Context Rules
- **No duplicate logging**: If the user asks a follow-up about a record you just logged, do NOT log again. Only log when new health info is provided. Off-topic chitchat → no log, just redirect.
- **Edit/delete requests**: If the user wants to fix, change, or delete a past record (e.g., "I misspoke", "remove yesterday's entry", "actually it was dizziness not headache"), do **NOT** call log_symptom. Instead, briefly tell them they can edit or delete it directly in the **timeline** by opening that day on the calendar and tapping the record. Reply in their language. Do **not** create a new "correction" log — leave the timeline for them to fix.
- **Recurring symptoms**: If the user reports the same symptom on consecutive days (check This Week's Records), proactively note the pattern.

## Few-Shot Examples
Always reply in the user's language.

### Example 1: Food + symptom in one story → ONE call (symptom_feeling)
User: "I ate a lot of tofu today, then my stomach felt bad and I got diarrhea."
log_symptom JSON: {"content":"Ate a lot of tofu, then stomach discomfort and diarrhea","keywords":["abdominal discomfort","diarrhea"],"severity":"medium","time_of_day":"now","category":"symptom_feeling"}
Why: Food triggered symptom; primary intent is the symptom. Two keywords because they're distinct symptoms.
Reply: Confirm + note recurrence if applicable + specific advice (post-meal diarrhea within 1-2h suggests intolerance vs. later suggests other causes).

### Example 2: Multiple supplements + symptom + medication → TWO calls
User: "I took vitamin C, CoQ10, and fish oil today. Had a slight headache, took ibuprofen, felt better after."
Call 1 (symptom_feeling): {"content":"Slight headache, improved after taking ibuprofen","keywords":["headache"],"severity":"low","time_of_day":"now","category":"symptom_feeling"}
Call 2 (medication_supplement): {"content":"Took vitamin C, CoQ10, fish oil, and ibuprofen today","keywords":["vitamin C","CoQ10","fish oil","ibuprofen"],"severity":"positive","time_of_day":"now","category":"medication_supplement"}
Why: Two distinct intents — symptom story AND supplement regimen. Ibuprofen appears in both as relevant context.

### Example 3: Exercise caused pain → ONE call (symptom_feeling, not behavior_treatment)
User: "I worked out today, my wrist hurts badly after."
log_symptom JSON: {"content":"Wrist hurts badly after working out","keywords":["wrist pain"],"severity":"high","time_of_day":"now","category":"symptom_feeling"}
Why: Main concern is the pain, not the workout. When exercise causes a symptom, prioritize symptom_feeling.
Reply: Causes (improper grip, excessive weight), remedies (rest, ice, avoid grip exercises), benchmarks (8-12 reps appropriate), red flags (>5 days, swelling, numbness → doctor).

### Example 4: Positive activity, no symptom → ONE call (behavior_treatment)
User: "I went swimming today, felt great."
log_symptom JSON: {"content":"Went swimming today, felt great","keywords":[],"severity":"positive","time_of_day":"now","category":"behavior_treatment"}
Why: No symptom, just positive activity. Empty keywords, severity positive.

### Example 5: Off-topic question → no tool call, do not answer it
User: "Help me write some Python code."
Action: none.
Reply: Warmly decline and redirect to health topics. Do NOT answer the off-topic question even partially — no code snippets, no general guidance, just a friendly redirect (e.g., "I'm focused on helping with your health — I can't help with coding, but happy to chat about anything wellness-related.").

### Example 6: Follow-up question about an existing log → no tool call
User (after just logging a headache): "Could this headache be from not sleeping well?"
Action: none — the user is asking ABOUT the existing record, not reporting new info. Do NOT log again.
Reply: Discuss the sleep-headache connection. Reference the user's poor sleep quality from <context> if available. Specific sleep hygiene tips: consistent bedtime, no screens 30 min before sleep, cool dark room. Suggest tracking whether headaches correlate with poor-sleep nights.

### Example 7: Past day with relative phrase → rewrite content
Assume App calendar today = 2026-04-07. User: "我昨天拉肚子了。"
log_symptom JSON: {"content":"拉肚子，多次水样便","keywords":["腹泻"],"severity":"medium","time_of_day":"now","category":"symptom_feeling","local_date":"2026-04-06"}
Why: local_date pins the row to 4/6. Content must NOT say 昨天 — on the 4/6 card that reads as "the day before 4/6". Rewrite as neutral same-day wording.

### Example 8: Multi-day symptoms → multiple calls, rewrite content per day
Assume App calendar today = 2026-04-07. User: "Headache started two days ago, still had it yesterday, a bit better today."
Call 1 (2026-04-05): {"content":"Headache began that day","keywords":["headache"],"severity":"medium","time_of_day":"now","category":"symptom_feeling","local_date":"2026-04-05"}
Call 2 (2026-04-06): {"content":"Headache still present through the day","keywords":["headache"],"severity":"medium","time_of_day":"now","category":"symptom_feeling","local_date":"2026-04-06"}
Call 3 (2026-04-07): {"content":"Headache easing somewhat","keywords":["headache"],"severity":"low","time_of_day":"now","category":"symptom_feeling","local_date":"2026-04-07"}
Why: Each content written for that row's date — no "two days ago"/"yesterday"/"today" left on past cards.

### Example 9: User wants to fix a past record → no tool call, redirect to timeline
User: "Wait, yesterday's entry should be dizziness, not headache."
Action: none — do NOT call log_symptom (it cannot edit existing records).
Reply (user's language): Warm and short — they can fix it in the app: open the timeline / calendar, go to that day, tap the entry, and edit or delete there. Do NOT create a new correction log.

## Tools (use only when needed)
- **fetch_health_history**: Past summaries (monthly/quarterly/biannual). Use for trends/patterns. Choose shortest sufficient period. NOT for current symptoms.
- **list_documents**: List uploaded medical documents. Use when user asks about reports/test results/prescriptions.
- **fetch_document_detail(record_id)**: Get full AI summary of a specific document. Always call list_documents first.`.trim();

/** 单块 system 全文（用于 Anthropic + prompt cache）。 */
export const STATIC_SYSTEM_PROMPT = CHAT_SYSTEM_STATIC_CORE;

/** @deprecated 使用 STATIC_SYSTEM_PROMPT + messages 内 <context>；仅保留供调试或非 Anthropic 路径。 */
export const CHAT_SYSTEM_STATIC_FOR_CACHE = STATIC_SYSTEM_PROMPT;

export type AnthropicEphemeralCacheControl = { type: "ephemeral"; ttl?: "1h" | "5m" };

/** 单 block system，末尾 cache_control（与 tools 末项共同形成稳定可缓存前缀）。 */
export function getAnthropicChatStaticSystem(): Array<{
  type: "text";
  text: string;
  cache_control: AnthropicEphemeralCacheControl;
}> {
  return [
    {
      type: "text",
      text: STATIC_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral", ttl: "5m" },
    },
  ];
}

/** 首条 user 的完整文本：外包 `<context>` + 静默确认指令；innerMarkdown 为 buildBaseContext / buildFullContext 的 Markdown。 */
export function buildChatUserContextEnvelope(innerMarkdown: string): string {
  const body = innerMarkdown.trim();
  return `<context>\n${body}\n</context>\n\n(Acknowledge silently, then wait for the user's next message.)`;
}

export function buildSystemPrompt(context: string): string {
  const tail = context.trim();
  return tail ? `${STATIC_SYSTEM_PROMPT}\n\n${tail}`.trim() : STATIC_SYSTEM_PROMPT;
}

/** @deprecated 动态 context 已迁至 messages；请使用 getAnthropicChatStaticSystem()。 */
export function buildAnthropicSystemWithCache(context: string): Array<{
  type: "text";
  text: string;
  cache_control?: AnthropicEphemeralCacheControl;
}> {
  const tail = context.trim();
  return [
    {
      type: "text",
      text: STATIC_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral", ttl: "5m" },
    },
    {
      type: "text",
      text: tail.length > 0 ? tail : " ",
    },
  ];
}

// ── Deep-analysis scoring router ─────────────────────────────

const TREND_PATTERN =
  /trend|pattern|lately|recently|past (?:week|month|months|year)|always|keep(?:ing)?|getting (?:worse|better)|improv|最近|一直|趋势|规律|以前|历史|这段时间|好转|变化|últimamente|recientemente|tendencia|patrón|empeorando|mejorando|récemment|dernièrement|tendance|évolution|empirer|s'améliorer/i;

const CONCERN_PATTERN =
  /should I|serious|worried|concern|see a doctor|严重|需要|要不要|看医生|担心|建议|要紧吗|有问题吗|debería|grave|preocupad[oa]|ver a un médico|devrais-je|inqui[eè]t|voir un médecin/i;

const MEDICAL_DOC_PATTERN =
  /lab ?result|blood ?test|x-?ray|mri|ct ?scan|prescription|report|检查|化验|报告|处方|体检|血常规|尿检|análisis|resultado|radiografía|receta|résultat|ordonnance|radiographie/i;

const RISK_FLAG_STOP_WORDS = new Set([
  "family", "history", "risk", "concern", "issue", "condition", "of", "a", "the", "with", "and", "or", "in", "for", "to",
  "家族", "病史", "风险", "问题", "情况", "有", "的", "和",
  "familia", "historial", "riesgo", "problema", "condición", "de", "un", "una", "con", "del", "los", "las", "el", "la",
  "famille", "antécédents", "risque", "problème", "affection", "des", "du", "le",
]);

const COMMON_SYNONYMS: Record<string, string[]> = {
  diabetes: ["blood sugar", "glucose", "diabetic", "糖尿病", "血糖"],
  hypertension: ["high blood pressure", "blood pressure", "高血压", "血压高", "hipertensión", "presión arterial"],
  thyroid: ["甲状腺", "tiroides", "thyroïde"],
  asthma: ["哮喘", "asma", "asthme"],
  cancer: ["癌", "tumor", "tumour", "cáncer", "tumeur"],
  heart: ["cardiac", "cardiovascular", "心脏", "心血管", "cardíaco", "cardiaque"],
  cholesterol: ["胆固醇", "colesterol", "cholestérol"],
};

/**
 * Extract medically meaningful keywords from risk flag strings.
 * Removes generic words (family, history, risk, etc.) and keeps
 * the meaningful medical terms, plus any known synonyms.
 */
export function extractMedicalKeywords(riskFlags: string[]): string[] {
  const keywords: string[] = [];
  for (const flag of riskFlags) {
    const lower = flag.toLowerCase().trim();
    if (!lower) continue;
    keywords.push(lower);
    const words = lower.split(/[\s,;/]+/).filter(Boolean);
    const meaningful = words.filter((w) => w.length >= 2 && !RISK_FLAG_STOP_WORDS.has(w));
    for (const w of meaningful) {
      keywords.push(w);
      const syns = Object.entries(COMMON_SYNONYMS).find(
        ([key, vals]) => key === w || vals.some((v) => v === w)
      );
      if (syns) {
        keywords.push(syns[0]);
        keywords.push(...syns[1]);
      }
    }
  }
  return [...new Set(keywords)];
}

export type DeepAnalysisResult = {
  shouldEscalate: boolean;
  score: number;
  reasons: string[];
};

export type DeepAnalysisInput = {
  message: string;
  riskFlags: string[];
  imageCount?: number;
  hasEmptyText?: boolean;
};

const ESCALATION_THRESHOLD = 2;

/**
 * Scoring-based deep-analysis router.
 *
 * Test expectations:
 *   "我最近头疼"                           → escalate (trend +1, risk match possible → ≥2)
 *   "我头疼"                               → probably not (score 0–1)
 *   "Últimamente me duele la cabeza"       → escalate (trend +1)
 *   "Je m'inquiète, est-ce grave ?"        → escalate (concern +1, trend possible → ≥2)
 *   image-only upload of a report          → escalate (image +1, empty text +1, doc hint +2 → ≥2)
 *   "hello"                                → not escalate (score 0)
 */
export function analyzeDeepAnalysisNeed(input: DeepAnalysisInput): DeepAnalysisResult {
  const { message, riskFlags, imageCount = 0, hasEmptyText } = input;
  const lowerMsg = message.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (TREND_PATTERN.test(message)) {
    score += 1;
    reasons.push("trend_language");
  }

  if (CONCERN_PATTERN.test(message)) {
    score += 1;
    reasons.push("concern_language");
  }

  const medicalKeywords = extractMedicalKeywords(riskFlags);
  const matchedFlags = medicalKeywords.filter((kw) => lowerMsg.includes(kw));
  if (matchedFlags.length > 0) {
    score += 2;
    reasons.push(`risk_flag_match:${matchedFlags.slice(0, 3).join(",")}`);
  }

  if (imageCount > 0) {
    score += 1;
    reasons.push("has_images");

    const textIsEmpty = hasEmptyText ?? (message.trim().length === 0);
    const textIsMinimal = message.trim().length > 0 && message.trim().length <= 10;
    if (textIsEmpty || textIsMinimal) {
      score += 1;
      reasons.push("image_with_little_text");
    }

    if (MEDICAL_DOC_PATTERN.test(message)) {
      score += 2;
      reasons.push("likely_medical_document");
    }
  }

  if (message.length > 120 && (message.includes("\n") || message.split(/[,，;；。.!！?？]/).length >= 3)) {
    score += 1;
    reasons.push("complex_message");
  }

  return {
    shouldEscalate: score >= ESCALATION_THRESHOLD,
    score,
    reasons,
  };
}

/** @deprecated Use analyzeDeepAnalysisNeed instead */
export function needsDeepAnalysis(
  message: string,
  riskFlags: string[]
): boolean {
  return analyzeDeepAnalysisNeed({ message, riskFlags }).shouldEscalate;
}
