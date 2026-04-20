/** 与 symptom_summaries.category / chat log_symptom 一致 */
export type SymptomRecordCategory =
  | "symptom_feeling"
  | "medication_supplement"
  | "diet"
  | "behavior_treatment";

export const SYMPTOM_RECORD_CATEGORY_OPTIONS: {
  value: SymptomRecordCategory;
  label: string;
}[] = [
  { value: "symptom_feeling", label: "Symptoms & feelings" },
  { value: "medication_supplement", label: "Medications & supplements" },
  { value: "diet", label: "Diet & intake" },
  { value: "behavior_treatment", label: "Activity & care" },
];

export function symptomCategoryNeedsKeywords(cat: SymptomRecordCategory | string | null | undefined): boolean {
  return cat === "symptom_feeling" || cat === "medication_supplement";
}

/** 单条症状摘要记录（来自 symptom_summaries） */
export interface SymptomEntry {
  id: string;
  local_date: string;
  created_at: string;
  summary: string;
  severity?: string | null;
  meta?: { symptom_keywords?: string[] } | null;
  tags?: string[] | null;
  category?: string | null;
}

/** 从 meta.symptom_keywords 或 tags 解析展示用关键词 */
export function getKeywordsFromEntry(e: SymptomEntry): string[] {
  const fromMeta = e.meta?.symptom_keywords;
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta.map((x) => String(x).trim()).filter(Boolean);
  }
  if (Array.isArray(e.tags) && e.tags.length > 0) {
    return e.tags.map((x) => String(x).trim()).filter(Boolean);
  }
  return [];
}

/** 按日期聚合的摘要（用于日历列表） */
export interface DayAggregated {
  date: string; // YYYY-MM-DD
  entries: SymptomEntry[];
  aggregatedTags: { tag: string; count: number; severity: string | null }[];
}

/** 时间分区 */
export type TimeSlotKey =
  | "morning"         // 6-12
  | "afternoon"       // 12-18
  | "evening"         // 18-22
  | "night";          // 22-6

export interface TimeSlotConfig {
  key: TimeSlotKey;
  label: string;
  range: string;
  startHour: number;
  endHour: number;
}
