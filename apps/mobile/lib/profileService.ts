import { supabase } from "@/lib/supabase";
import type { OnboardingSurvey } from "@/lib/onboardingInsight";

/** 档案页自由文本字段 key，与 UI 一一对应 */
export const PROFILE_DISPLAY_KEYS = [
  "age_range",
  "gender",
  "occupation",
  "smoking",
  "alcohol",
  "health_concerns",
  "chronic_conditions",
  "family_history",
  "medications",
  "activity_level",
  "sleep_quality",
] as const;

export type ProfileDisplayKey = (typeof PROFILE_DISPLAY_KEYS)[number];
export type ProfileDisplay = Partial<Record<ProfileDisplayKey, string>>;

export interface HealthProfile {
  id?: string;
  user_id: string;
  gender: string | null;
  age: number | null;
  occupation: string | null;
  bad_habits: string | null;
  medical_history: string | null;
  family_history: string | null;
  /** Onboarding 问卷原始数据，用于派生 profile 初值 */
  onboarding_survey?: OnboardingSurvey | null;
  /** 档案页自由文本（用户可编辑），初值由 onboarding 派生 */
  profile_display?: ProfileDisplay | null;
}

/**
 * 由 onboarding 问卷答案派生档案页初始文案（用户要求规则）：
 * - 服药/补充剂：选「是」→「正在服用」，选「否」→「无」
 * - 家族病史：选「是」→「有（具体疾病）」，选「否」→「没有」，选「不确定」→「不确定」
 */
export function deriveProfileDisplayFromSurvey(survey: OnboardingSurvey | null | undefined): ProfileDisplay {
  if (!survey) return {};

  const familyHistory =
    survey.family_history === "Yes" && survey.family_conditions?.length
      ? survey.family_conditions.join(", ")
      : "";

  const chronicConditions =
    survey.chronic_disease_distress === "Yes" && survey.chronic_conditions?.length
      ? survey.chronic_conditions.join(", ")
      : "";

  return {
    age_range: survey.age_range ?? "",
    gender: survey.gender ?? "",
    occupation: "",
    smoking: survey.smoking ?? "",
    alcohol: survey.alcohol ?? "",
    health_concerns: (survey.health_concerns ?? []).join(", ") || "",
    chronic_conditions: chronicConditions,
    family_history: familyHistory,
    medications: "",
    activity_level: survey.activity_level ?? "",
    sleep_quality: survey.sleep_quality ?? "",
  };
}

/** 服务端 document context 管道写入的聚合资料上下文（RLS：用户只读自己的行） */
export interface UserDocumentContext {
  user_id: string;
  docs_summary: string | null;
  docs_items: unknown;
  risk_flags: string[] | null;
  generated_by_model: string | null;
  updated_at: string;
}

export interface ProfileDocumentUpload {
  id: string;
  user_id: string;
  record_id: string;
  category: "medical_record" | "treatment_record" | "other_app";
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  ai_summary: string | null;
  user_summary: string | null; // legacy per-image field
  group_title: string | null;
  group_ai_summary: string | null;
  group_user_summary: string | null;
  extracted_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function fetchHealthProfile(userId: string): Promise<HealthProfile | null> {
  const { data, error } = await supabase
    .from("health_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as HealthProfile | null;
}

export async function fetchUserDocumentContext(
  userId: string
): Promise<UserDocumentContext | null> {
  const { data, error } = await supabase
    .from("user_document_context")
    .select("user_id, docs_summary, docs_items, risk_flags, generated_by_model, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (String(error.code) === "42P01" || String(error.code) === "PGRST205") {
      return null;
    }
    throw error;
  }
  return data as UserDocumentContext | null;
}

export async function fetchProfileDocumentUploads(
  userId: string
): Promise<ProfileDocumentUpload[]> {
  const { data, error } = await supabase
    .from("profile_document_uploads")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Backward compatibility: migration not applied yet (table does not exist).
  if (error) {
    if (String(error.code) === "42P01") {
      return [];
    }
    throw error;
  }
  return (data ?? []) as ProfileDocumentUpload[];
}

export async function createProfileDocumentUploads(
  userId: string,
  payloads: Array<{
    record_id: string;
    category: ProfileDocumentUpload["category"];
    storage_bucket: string;
    storage_path: string;
    mime_type?: string | null;
  }>
): Promise<ProfileDocumentUpload[]> {
  if (payloads.length === 0) return [];
  const firstTry = await supabase
    .from("profile_document_uploads")
    .insert(
      payloads.map((payload) => ({
        user_id: userId,
        record_id: payload.record_id,
        category: payload.category,
        storage_bucket: payload.storage_bucket,
        storage_path: payload.storage_path,
        mime_type: payload.mime_type ?? null,
        status: "processing",
      }))
    )
    .select("*");
  if (!firstTry.error) return (firstTry.data ?? []) as ProfileDocumentUpload[];

  // Backward compatibility: migration 007 not applied (missing record_id column).
  // 42703 = PostgreSQL undefined_column, PGRST204 = PostgREST schema cache column not found
  const isRecordIdMissing =
    String(firstTry.error.code) === "42703" || String(firstTry.error.code) === "PGRST204";
  if (isRecordIdMissing) {
    const legacy = await supabase
      .from("profile_document_uploads")
      .insert(
        payloads.map((payload) => ({
          user_id: userId,
          category: payload.category,
          storage_bucket: payload.storage_bucket,
          storage_path: payload.storage_path,
          mime_type: payload.mime_type ?? null,
          status: "processing",
        }))
      )
      .select("*");
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []).map((x) => ({
      ...(x as ProfileDocumentUpload),
      record_id: (x as { id: string }).id,
      group_title: null,
      group_ai_summary: null,
      group_user_summary: null,
    }));
  }

  throw firstTry.error;
}

export async function updateProfileDocumentRecordSummary(
  recordId: string,
  userSummary: string
): Promise<void> {
  const firstTry = await supabase
    .from("profile_document_uploads")
    .update({ group_user_summary: userSummary })
    .eq("record_id", recordId);
  if (!firstTry.error) return;
  const errCode = String(firstTry.error.code);
  if (errCode === "42703" || errCode === "PGRST204") {
    const legacy = await supabase
      .from("profile_document_uploads")
      .update({ user_summary: userSummary })
      .eq("id", recordId);
    if (legacy.error) throw legacy.error;
    return;
  }
  throw firstTry.error;
}

export async function deleteProfileDocumentRecord(
  recordId: string,
  fallbackItemIds: string[] = []
): Promise<void> {
  const firstTry = await supabase
    .from("profile_document_uploads")
    .delete()
    .eq("record_id", recordId)
    .select("id");
  if (!firstTry.error) {
    const deletedCount = (firstTry.data ?? []).length;
    if (deletedCount > 0) return;
    throw new Error("No record was deleted. Please confirm the record still exists.");
  }
  const errCode = String(firstTry.error.code);
  if (errCode === "42703" || errCode === "PGRST204") {
    let legacy;
    if (fallbackItemIds.length > 0) {
      legacy = await supabase
        .from("profile_document_uploads")
        .delete()
        .in("id", fallbackItemIds)
        .select("id");
    } else {
      legacy = await supabase
        .from("profile_document_uploads")
        .delete()
        .eq("id", recordId)
        .select("id");
    }
    if (legacy.error) throw legacy.error;
    const deletedCount = (legacy.data ?? []).length;
    if (deletedCount > 0) return;
    throw new Error("No record was deleted. Please run the latest migration and try again.");
    return;
  }
  throw firstTry.error;
}

// ── Health Summaries (multi-layer memory) ───────────────────

export const HEALTH_SUMMARY_LEVELS = [
  "rolling_weekly",
  "monthly",
  "quarterly",
  "biannual",
] as const;

export type HealthSummaryLevel = (typeof HEALTH_SUMMARY_LEVELS)[number];

export interface HealthSummary {
  id: string;
  user_id: string;
  level: string;
  is_latest: boolean;
  window_start: string;
  window_end: string;
  summary: string | null;
  stats: {
    log_count: number;
    top_tags: string[];
    tag_frequency: Record<string, number>;
    avg_severity: string;
    trend: "improving" | "stable" | "worsening";
  } | null;
  created_at: string;
}

export async function fetchLatestHealthSummaries(
  userId: string
): Promise<Record<HealthSummaryLevel, HealthSummary | null>> {
  const result: Record<HealthSummaryLevel, HealthSummary | null> = {
    rolling_weekly: null,
    monthly: null,
    quarterly: null,
    biannual: null,
  };

  const { data, error } = await supabase
    .from("health_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("is_latest", true)
    .in("level", [...HEALTH_SUMMARY_LEVELS]);

  if (error) {
    if (String(error.code) === "42P01") return result;
    throw error;
  }

  for (const row of data ?? []) {
    const lvl = row.level as HealthSummaryLevel;
    if (HEALTH_SUMMARY_LEVELS.includes(lvl)) {
      result[lvl] = row as HealthSummary;
    }
  }
  return result;
}

export async function fetchWeeklySnapshots(
  userId: string,
  limit = 12
): Promise<HealthSummary[]> {
  const { data, error } = await supabase
    .from("health_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("level", "weekly_snapshot")
    .order("window_start", { ascending: false })
    .limit(limit);

  if (error) {
    if (String(error.code) === "42P01") return [];
    throw error;
  }
  return (data ?? []) as HealthSummary[];
}

export async function upsertHealthProfile(
  userId: string,
  updates: Partial<Omit<HealthProfile, "id" | "user_id">>
): Promise<HealthProfile> {
  const { data, error } = await supabase
    .from("health_profiles")
    .upsert(
      {
        user_id: userId,
        ...updates,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as HealthProfile;
}
