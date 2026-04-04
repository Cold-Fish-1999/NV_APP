/** 单条症状摘要记录（来自 symptom_summaries） */
export interface SymptomEntry {
  id: string;
  local_date: string;
  created_at: string;
  summary: string;
  severity?: string | null;
  meta?: { symptom_keywords?: string[] } | null;
  tags?: string[] | null;
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
