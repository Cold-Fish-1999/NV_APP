/**
 * 日期与标签聚合工具
 */

/** Local-timezone YYYY-MM-DD (avoids the UTC drift from toISOString) */
export function toLocalDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 格式化为 "Feb 23" */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const month = MONTH_NAMES[d.getMonth()];
  const day = d.getDate();
  return `${month} ${day}`;
}

/** 格式化为星期 "Tue" */
export function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return WEEKDAY_NAMES[d.getDay()];
}

/** 格式化为 "Feb 23, Tue" */
export function formatDateWithWeekday(dateStr: string): string {
  return `${formatDateShort(dateStr)}, ${formatWeekday(dateStr)}`;
}

/** 格式化为时间 "14:30" */
export function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const SEVERITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  positive: 0,
};

function worstSeverity(a: string | null, b: string | null): string | null {
  const ra = a ? (SEVERITY_RANK[a] ?? -1) : -1;
  const rb = b ? (SEVERITY_RANK[b] ?? -1) : -1;
  return ra >= rb ? a : b;
}

/**
 * 从 entries 的 meta.symptom_keywords 聚合标签（tags 列、summary 作为补充）
 * 规则：去重；count = 出现次数；按 count desc 排序；取前 N 个
 * 每个 tag 关联该 entry 的 severity（同名 tag 多次出现取最严重等级）
 */
export function aggregateTags(
  entries: {
    meta?: { symptom_keywords?: string[] } | null;
    tags?: string[] | null;
    summary?: string;
    severity?: string | null;
  }[],
  maxCount = 5,
): { tag: string; count: number; severity: string | null }[] {
  const map = new Map<string, { count: number; severity: string | null }>();

  const track = (key: string, sev: string | null) => {
    const prev = map.get(key);
    if (prev) {
      prev.count++;
      prev.severity = worstSeverity(prev.severity, sev);
    } else {
      map.set(key, { count: 1, severity: sev ?? null });
    }
  };

  for (const e of entries) {
    let added = false;
    const sev = e.severity ?? null;
    const kw = e.meta?.symptom_keywords;
    if (Array.isArray(kw) && kw.length > 0) {
      for (const t of kw) {
        const s = String(t).trim();
        if (!s) continue;
        track(s, sev);
        added = true;
      }
    }
    if (!added) {
      const tags = e.tags;
      if (Array.isArray(tags)) {
        for (const t of tags) {
          const s = String(t).trim();
          if (!s) continue;
          track(s, sev);
          added = true;
        }
      }
    }
    if (!added && e.summary) {
      const s = String(e.summary).trim().slice(0, 12);
      if (s) track(s, sev);
    }
  }
  return Array.from(map.entries())
    .map(([tag, { count, severity }]) => ({ tag, count, severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxCount);
}

/** 时间分区配置 */
export const TIME_SLOTS: { key: string; label: string; range: string; startHour: number; endHour: number }[] = [
  { key: "morning", label: "Morning", range: "6:00–12:00", startHour: 6, endHour: 12 },
  { key: "afternoon", label: "Afternoon", range: "12:00–18:00", startHour: 12, endHour: 18 },
  { key: "evening", label: "Evening", range: "18:00–22:00", startHour: 18, endHour: 22 },
  { key: "night", label: "Night", range: "22:00–6:00", startHour: 22, endHour: 6 },
];

/**
 * 根据 created_at 将 entry 分配到时间分区
 * Night 跨日：22:00-6:00
 */
export function getTimeSlotForEntry(createdAt: string): string {
  const d = new Date(createdAt);
  const h = d.getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night"; // 22-6
}
