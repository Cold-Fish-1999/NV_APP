import { supabaseAdmin } from "@/lib/supabase";

export type ChatContextData = {
  profile: Record<string, unknown> | null;
  riskFlags: string[];
  docsSummary: string | null;
  thisWeekLogs: Array<{
    local_date: string;
    summary: string;
    tags: string[];
    severity: string | null;
    meta: { symptom_keywords?: string[] } | null;
  }>;
  summaryMap: Record<string, string>;
  recentHistory: Array<{ role: "user" | "assistant"; content: string }>;
};

function getStartOfISOWeek(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy.toISOString().slice(0, 10);
}

export async function fetchChatContext(
  userId: string,
  dateStr: string
): Promise<ChatContextData> {
  const startOfThisWeek = getStartOfISOWeek(new Date(dateStr + "T12:00:00"));

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
        .select("local_date, summary, tags, severity, meta")
        .eq("user_id", userId)
        .gte("local_date", startOfThisWeek)
        .order("local_date", { ascending: false })
        .limit(50),

      supabaseAdmin
        .from("chat_messages")
        .select("role, content, created_at")
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
  }>)
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
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
  profile: Record<string, unknown> | null;
  riskFlags: string[];
  thisWeekLogs: ChatContextData["thisWeekLogs"];
  rollingWeeklySummary: string | null;
}): string {
  const p = params.profile;
  const pd = (p?.profile_display ?? {}) as Record<string, string>;

  return `
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
${params.riskFlags.length > 0 ? params.riskFlags.join("\n") : "None identified"}

## This Week's Records
${
  params.thisWeekLogs.length > 0
    ? params.thisWeekLogs
        .map(
          (l) =>
            `- ${l.local_date}: ${l.summary}${
              l.meta?.symptom_keywords?.length
                ? ` [${l.meta.symptom_keywords.join(", ")}]`
                : l.tags?.length
                  ? ` [${l.tags.join(", ")}]`
                  : ""
            }`
        )
        .join("\n")
    : "No records this week"
}

## Recent Summary
${params.rollingWeeklySummary ?? "Not available yet"}
  `.trim();
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
${params.monthlySummary ?? "Not available"}

## Past 3 Months
${params.quarterlySummary ?? "Not available"}

## Past 6 Months
${params.biannualSummary ?? "Not available"}

## Health Documents Summary
${params.docsSummary ?? "No documents uploaded"}
  `.trim()
  );
}

export function buildSystemPrompt(context: string): string {
  return `
You are a personal health assistant. Help users track symptoms and understand
their health patterns.

You have access to the user's health history shown below. Reference it naturally
when relevant — never recite it back verbatim. Make the user feel understood
without being clinical or alarming.

Guidelines:
- You ONLY discuss health, wellness, symptoms, nutrition, exercise, sleep, mental
  wellbeing, and medical topics. For ANY off-topic question (tech, math, coding,
  news, entertainment, general knowledge, etc.), warmly decline and redirect.
  Do NOT answer the off-topic question even partially. Always reply in the same
  language the user is using. Example responses:
  EN: "I'm your health companion, so I'm best at helping with health and wellness
  topics! Feel free to ask me about symptoms, nutrition, sleep, exercise, or how
  you're feeling — I'm here for that."
  ZH: "我是你的健康助手，最擅长的是健康和身心相关的话题哦～有任何关于症状、饮食、
  睡眠、运动或身体感受的问题，随时问我！"
- When the user describes a current symptom, feeling, food intake, medication, exercise, or
  any health-related activity, ALWAYS call log_symptom to record it with the correct category:
  * symptom_feeling — symptoms, feelings, emotions, physical sensations
  * diet — food/drink intake (no keywords needed)
  * medication_supplement — medications, supplements, vitamins (generate drug/supplement name keywords)
  * behavior_treatment — exercise, therapy, doctor visits (no keywords needed)
  Only symptom_feeling and medication_supplement need keywords. For diet and behavior_treatment,
  set keywords to an empty array [].
  Then reply with a warm brief confirmation.
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

Tools for retrieving additional context (use ONLY when the user's question requires it):
- fetch_health_history: Retrieve health summaries for a past period (monthly/quarterly/biannual).
  Use when the user asks about trends, patterns, or past symptoms beyond this week.
  Examples: "最近几个月怎么样", "my headaches getting worse?", "how have I been lately?"
  Choose the shortest period that answers the question. Do NOT call this for current symptoms.
- list_documents: List the user's uploaded medical documents (lab reports, checkups, prescriptions).
  Use when the user mentions their medical documents, test results, or health records.
  Examples: "我之前的体检报告", "what did my blood test show?", "check my prescription"
- fetch_document_detail: Get the full AI summary of a specific document by record_id.
  Use AFTER list_documents when you need to reference a specific document's content.
  Always call list_documents first to get record_ids, then fetch_document_detail for the relevant one.

${context}
  `.trim();
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
