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
  `.trim();
}

const TREND_PATTERN =
  /trend|pattern|lately|recently|past (?:week|month|months|year)|always|keep(?:ing)?|getting (?:worse|better)|improv|最近|一直|趋势|规律|以前|历史|这段时间|好转|变化/i;
const CONCERN_PATTERN =
  /should I|serious|worried|concern|see a doctor|严重|需要|要不要|看医生|担心|建议|要紧吗|有问题吗/i;

export function needsDeepAnalysis(
  message: string,
  riskFlags: string[]
): boolean {
  const lowerMsg = message.toLowerCase();
  const riskFlagTriggered = riskFlags.some((flag) => {
    const firstWord = flag.toLowerCase().split(" ")[0];
    return firstWord.length >= 3 && lowerMsg.includes(firstWord);
  });

  return riskFlagTriggered || TREND_PATTERN.test(message) || CONCERN_PATTERN.test(message);
}
