import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────

export interface WeeklyReportData {
  total_records: number;
  distinct_types: number;
  avg_severity: string;
  overall_trend: "improving" | "stable" | "worsening";
  top_symptoms: Array<{ name: string; count: number }>;
  symptom_trends: Array<{
    name: string;
    trend: "up" | "same" | "dn";
    description: string;
    weeks: Array<{ label: string; count: number }>;
  }>;
  severity_breakdown: { high: number; medium: number; low: number };
  things_to_watch: Array<{
    symptom: string;
    risk: "high" | "medium" | "low";
    cause: string;
    tip?: string;
  }>;
  previous_weeks: Array<{
    week_start: string;
    week_end: string;
    record_count: number;
    trend: "improving" | "stable" | "worsening";
  }>;
  medication_summary?: Array<{ name: string; count: number }>;
  medication_trends?: Array<{
    name: string;
    trend: "up" | "same" | "dn";
    description: string;
    weeks: Array<{ label: string; count: number }>;
  }>;
}

export interface WeeklyReportRow {
  id: string;
  week_start: string;
  week_end: string;
  data: WeeklyReportData;
  created_at: string;
}

export interface MonthlyReportData {
  total_records: number;
  distinct_types: number;
  active_days: number;
  month_label: string;
  vs_prev_month_pct: number | null;
  vs_two_months_pct: number | null;
  top_symptoms: Array<{
    name: string;
    count: number;
    trend: "up" | "same" | "dn";
    description: string;
    weekly_breakdown: Array<{ label: string; count: number }>;
  }>;
  breakdown: Array<{ name: string; count: number }>;
  things_to_watch: Array<{
    symptom: string;
    risk: "high" | "medium" | "low";
    cause: string;
    tip?: string;
  }>;
  medication_trends?: Array<{
    name: string;
    count: number;
    trend: "up" | "same" | "dn";
    description: string;
    weekly_breakdown: Array<{ label: string; count: number }>;
  }>;
}

export interface MonthlyReportRow {
  id: string;
  report_month: string;
  month_start: string;
  month_end: string;
  data: MonthlyReportData;
  created_at: string;
}

// ── Queries ──────────────────────────────────────────────────

export async function fetchLatestWeeklyReport(): Promise<WeeklyReportRow | null> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("id, week_start, week_end, data, created_at")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[reportService] fetchLatestWeekly:", error.message);
    return null;
  }
  return data as WeeklyReportRow | null;
}

export async function fetchWeeklyReports(limit = 5): Promise<WeeklyReportRow[]> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("id, week_start, week_end, data, created_at")
    .order("week_start", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[reportService] fetchWeeklyReports:", error.message);
    return [];
  }
  return (data ?? []) as WeeklyReportRow[];
}

export async function fetchLatestMonthlyReport(): Promise<MonthlyReportRow | null> {
  const { data, error } = await supabase
    .from("monthly_reports")
    .select("id, report_month, month_start, month_end, data, created_at")
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[reportService] fetchLatestMonthly:", error.message);
    return null;
  }
  return data as MonthlyReportRow | null;
}

export async function fetchAllWeeklyReports(): Promise<WeeklyReportRow[]> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("id, week_start, week_end, data, created_at")
    .order("week_start", { ascending: false });

  if (error) {
    console.warn("[reportService] fetchAllWeekly:", error.message);
    return [];
  }
  return (data ?? []) as WeeklyReportRow[];
}

export async function fetchAllMonthlyReports(): Promise<MonthlyReportRow[]> {
  const { data, error } = await supabase
    .from("monthly_reports")
    .select("id, report_month, month_start, month_end, data, created_at")
    .order("report_month", { ascending: false });

  if (error) {
    console.warn("[reportService] fetchAllMonthly:", error.message);
    return [];
  }
  return (data ?? []) as MonthlyReportRow[];
}
