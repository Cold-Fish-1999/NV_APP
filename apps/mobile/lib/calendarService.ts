import { supabase } from "@/lib/supabase";
import { aggregateTags, toLocalDateStr } from "@/lib/dateUtils";
import type { SymptomEntry } from "@/types/calendar";

export interface DayAggregated {
  date: string;
  entries: SymptomEntry[];
  aggregatedTags: { tag: string; count: number; severity: string | null }[];
}

/** 从 symptom_summaries 拉取指定日期范围的记录 */
export async function fetchSymptomSummaries(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<SymptomEntry[]> {
  const { data, error } = await supabase
    .from("symptom_summaries")
    .select("id, local_date, created_at, summary, severity, meta, tags, category")
    .eq("user_id", userId)
    .gte("local_date", fromDate)
    .lte("local_date", toDate)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SymptomEntry[];
}

/** 生成日期范围内的所有日期（倒序，从新到旧：toDate 在前，fromDate 在后） */
export function generateDateRange(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const from = new Date(fromDate + "T12:00:00");
  const to = new Date(toDate + "T12:00:00");
  const cur = new Date(to);
  while (cur >= from) {
    out.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() - 1);
  }
  return out;
}

/** 按日期分组并聚合标签，且包含范围内所有日期（无记录的日期也显示） */
export function groupByDateAndAggregate(
  entries: SymptomEntry[],
  dateRange: string[],
  maxTags = 5
): DayAggregated[] {
  const byDate = new Map<string, SymptomEntry[]>();
  for (const e of entries) {
    const d = e.local_date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(e);
  }
  return dateRange.map((date) => {
    const es = byDate.get(date) ?? [];
    return {
      date,
      entries: es,
      aggregatedTags: aggregateTags(es, maxTags),
    };
  });
}

/** 更新一条 symptom_summaries 记录的 summary */
export async function updateSymptomSummary(
  entryId: string,
  summary: string
): Promise<SymptomEntry> {
  const { data, error } = await supabase
    .from("symptom_summaries")
    .update({ summary })
    .eq("id", entryId)
    .select("id, local_date, created_at, summary, meta, tags")
    .single();

  if (error) throw error;
  return data as SymptomEntry;
}

/** 删除一条 symptom_summaries 记录 */
export async function deleteSymptomSummary(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("symptom_summaries")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

/** 默认预设关键词（用户无自定义时使用） */
export const DEFAULT_PRESET_KEYWORDS = [
  "Headache",
  "Fatigue",
  "Insomnia",
];

/** 获取用户预设关键词（按 sort_order 排序） */
export async function fetchUserKeywordPresets(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_keyword_presets")
    .select("keyword")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => r.keyword);
}

/** 添加用户预设关键词 */
export async function addUserKeywordPreset(
  userId: string,
  keyword: string
): Promise<void> {
  const k = keyword.trim();
  if (!k) return;

  const { data: existing } = await supabase
    .from("user_keyword_presets")
    .select("id")
    .eq("user_id", userId)
    .eq("keyword", k)
    .maybeSingle();

  if (existing) return;

  const { data: maxOrder } = await supabase
    .from("user_keyword_presets")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxOrder?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("user_keyword_presets").insert({
    user_id: userId,
    keyword: k,
    sort_order: sortOrder,
  });

  if (error) throw error;
}

/** 删除用户预设关键词 */
export async function deleteUserKeywordPreset(
  userId: string,
  keyword: string
): Promise<void> {
  const { error } = await supabase
    .from("user_keyword_presets")
    .delete()
    .eq("user_id", userId)
    .eq("keyword", keyword.trim());

  if (error) throw error;
}

/** 初始化用户预设（将默认关键词写入 DB，仅当用户无任何预设时） */
export async function initUserKeywordPresetsIfEmpty(
  userId: string
): Promise<string[]> {
  const existing = await fetchUserKeywordPresets(userId);
  if (existing.length > 0) return existing;

  const inserts = DEFAULT_PRESET_KEYWORDS.map((keyword, i) => ({
    user_id: userId,
    keyword,
    sort_order: i,
  }));

  const { error } = await supabase.from("user_keyword_presets").insert(inserts);
  if (error) throw error;

  return DEFAULT_PRESET_KEYWORDS;
}

/** 手动创建症状记录（日历界面录入） */
export async function createSymptomSummary(
  userId: string,
  payload: {
    local_date: string;
    summary: string;
    /** symptom_feeling | medication_supplement | diet | behavior_treatment */
    category?: string;
    tags?: string[];
    symptom_keywords?: string[];
    severity?: string;
    recorded_at?: string;
  }
): Promise<SymptomEntry> {
  const tags = payload.tags ?? [];
  const meta: Record<string, unknown> = {};
  if (Array.isArray(payload.symptom_keywords) && payload.symptom_keywords.length > 0) {
    meta.symptom_keywords = payload.symptom_keywords.filter((k) => typeof k === "string" && k.trim());
  }
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    local_date: payload.local_date,
    summary: payload.summary.trim(),
    category: payload.category ?? "symptom_feeling",
    tags,
    meta,
    severity: payload.severity ?? "medium",
  };
  if (payload.recorded_at) {
    insertPayload.created_at = payload.recorded_at;
  }
  const { data, error } = await supabase
    .from("symptom_summaries")
    .insert(insertPayload)
    .select("id, local_date, created_at, summary, severity, meta, tags, category")
    .single();

  if (error) throw error;
  return data as SymptomEntry;
}
