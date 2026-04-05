import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  format,
  getDate,
  startOfWeek,
  endOfWeek,
  subWeeks,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  differenceInDays,
} from "https://esm.sh/date-fns@3.6.0";
import {
  normalizeKeywordsBatch,
  applyMapping,
} from "../_shared/normalizeKeywords.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 50;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const SONNET_MODEL = "claude-sonnet-4-6";

// ── Types ────────────────────────────────────────────────────

interface SymptomSummaryRow {
  id: string;
  user_id: string;
  local_date: string;
  tags: string[];
  created_at: string;
}

interface WeeklyBucket {
  label: string;
  weekStart: Date;
  weekEnd: Date;
  count: number;
}

interface TopSymptom {
  name: string;
  count: number;
  trend: string;
  description: string;
  weekly_breakdown: { label: string; count: number }[];
}

interface ThingToWatch {
  symptom: string;
  risk: "high" | "medium" | "low";
  cause: string;
  tip?: string;
}

interface TrendBadge {
  symptom: string;
  trend: "up" | "same" | "dn";
  description: string;
}

interface ReportData {
  total_records: number;
  distinct_types: number;
  active_days: number;
  month_label: string;
  vs_prev_month_pct: number | null;
  vs_two_months_pct: number | null;
  top_symptoms: TopSymptom[];
  breakdown: { name: string; count: number }[];
  things_to_watch: ThingToWatch[];
}

// ── Main ─────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const today = new Date();

    if (getDate(today) > 7) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "Not first Monday of month" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    let offset = 0;
    let totalProcessed = 0;

    while (true) {
      const { data: users, error: usersErr } = await supabaseAdmin
        .from("user_entitlements")
        .select("user_id")
        .eq("is_pro", true)
        .range(offset, offset + BATCH_SIZE - 1);

      if (usersErr) {
        console.error("Error fetching users:", usersErr);
        break;
      }
      if (!users || users.length === 0) break;

      for (const { user_id } of users) {
        try {
          await processUser(user_id, today);
          totalProcessed++;
        } catch (err) {
          console.error(`Error processing user ${user_id}:`, err);
        }
      }

      if (users.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    return new Response(
      JSON.stringify({ ok: true, processed: totalProcessed }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-monthly-report fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── Per-user pipeline ────────────────────────────────────────

async function processUser(userId: string, today: Date) {
  const reportMonthDate = subMonths(today, 1);
  const reportMonth = format(reportMonthDate, "yyyy-MM");
  const monthStart = format(startOfMonth(reportMonthDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(reportMonthDate), "yyyy-MM-dd");

  // Step 1: check if report already exists
  const { data: existing } = await supabaseAdmin
    .from("monthly_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("report_month", reportMonth)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  // 3-month window for trends
  const threeMonthsAgo = subMonths(endOfMonth(reportMonthDate), 3);
  const windowStart = format(startOfMonth(threeMonthsAgo), "yyyy-MM-dd");

  // Step 2: fetch symptom summaries for 3-month window + normalize keywords
  const { data: allRows } = await supabaseAdmin
    .from("symptom_summaries")
    .select("id, user_id, local_date, tags, created_at")
    .eq("user_id", userId)
    .gte("local_date", windowStart)
    .lte("local_date", monthEnd)
    .order("local_date", { ascending: true });

  if (!allRows || allRows.length === 0) return;

  const uniqueKeywords = [...new Set(allRows.flatMap((r: SymptomSummaryRow) => r.tags ?? []))];
  const mapping = await normalizeKeywordsBatch(uniqueKeywords, ANTHROPIC_API_KEY);

  const normalizedRows = allRows.map((r: SymptomSummaryRow) => ({
    ...r,
    tags: applyMapping(r.tags ?? [], mapping),
  }));

  // Step 3: compute stats
  const reportData = computeStats(normalizedRows, reportMonthDate, today);

  if (reportData.total_records === 0) return;

  // Step 4: AI generation
  let thingsToWatch: ThingToWatch[] = [];
  let trendBadges: TrendBadge[] = [];

  try {
    const aiResult = await generateAiInsights(userId, reportData, monthStart, monthEnd);
    thingsToWatch = aiResult.things_to_watch;
    trendBadges = aiResult.trend_badges;
  } catch (err) {
    console.error(`AI generation failed for user ${userId}:`, err);
  }

  // Merge trend badges into top_symptoms
  for (const badge of trendBadges) {
    const sym = reportData.top_symptoms.find((s) => s.name === badge.symptom);
    if (sym) {
      sym.trend = badge.trend;
      sym.description = badge.description;
    }
  }

  const finalData: ReportData = {
    ...reportData,
    things_to_watch: thingsToWatch,
  };

  // Step 5: write to DB
  await supabaseAdmin.from("monthly_reports").insert({
    user_id: userId,
    report_month: reportMonth,
    month_start: monthStart,
    month_end: monthEnd,
    data: finalData,
  });
}

// ── Stats computation ────────────────────────────────────────

function computeStats(
  normalizedRows: SymptomSummaryRow[],
  reportMonthDate: Date,
  today: Date,
): Omit<ReportData, "things_to_watch"> {
  const monthStart = startOfMonth(reportMonthDate);
  const monthEnd = endOfMonth(reportMonthDate);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  const prevMonthDate = subMonths(reportMonthDate, 1);
  const prevMonthStart = format(startOfMonth(prevMonthDate), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(prevMonthDate), "yyyy-MM-dd");

  const twoMonthsAgoDate = subMonths(reportMonthDate, 2);
  const twoMonthsAgoStart = format(startOfMonth(twoMonthsAgoDate), "yyyy-MM-dd");
  const twoMonthsAgoEnd = format(endOfMonth(twoMonthsAgoDate), "yyyy-MM-dd");

  // Current month rows
  const currentRows = normalizedRows.filter(
    (r) => r.local_date >= monthStartStr && r.local_date <= monthEndStr,
  );
  const prevRows = normalizedRows.filter(
    (r) => r.local_date >= prevMonthStart && r.local_date <= prevMonthEnd,
  );
  const twoMonthsAgoRows = normalizedRows.filter(
    (r) => r.local_date >= twoMonthsAgoStart && r.local_date <= twoMonthsAgoEnd,
  );

  const totalRecords = currentRows.length;
  const allCurrentTags = currentRows.flatMap((r) => r.tags ?? []);
  const distinctTypes = new Set(allCurrentTags).size;
  const activeDays = new Set(currentRows.map((r) => r.local_date)).size;
  const monthLabel = format(reportMonthDate, "MMMM yyyy");

  // Percentage changes
  const prevCount = prevRows.length;
  const twoMonthsCount = twoMonthsAgoRows.length;
  const vsPrevMonthPct = prevCount > 0
    ? Math.round(((totalRecords - prevCount) / prevCount) * 100 * 10) / 10
    : null;
  const vsTwoMonthsPct = twoMonthsCount > 0
    ? Math.round(((totalRecords - twoMonthsCount) / twoMonthsCount) * 100 * 10) / 10
    : null;

  // Tag frequency across ALL 3-month rows for top symptoms
  const tagFreqAll: Record<string, number> = {};
  for (const r of normalizedRows) {
    for (const t of r.tags ?? []) {
      tagFreqAll[t] = (tagFreqAll[t] || 0) + 1;
    }
  }

  const sortedTags = Object.entries(tagFreqAll)
    .sort((a, b) => b[1] - a[1]);
  const top5Tags = sortedTags.filter(([, count]) => count >= 3).slice(0, 10).map(([name]) => name);

  // Weekly breakdown across 3-month window (~13 weeks)
  const threeMonthStart = startOfMonth(subMonths(reportMonthDate, 2));
  const weekStarts = eachWeekOfInterval(
    { start: threeMonthStart, end: monthEnd },
    { weekStartsOn: 1 },
  );

  const topSymptoms: TopSymptom[] = top5Tags.map((name) => {
    const weeklyBreakdown = weekStarts.map((ws) => {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const wsStr = format(ws, "yyyy-MM-dd");
      const weStr = format(we, "yyyy-MM-dd");
      const count = normalizedRows.filter(
        (r) => r.local_date >= wsStr && r.local_date <= weStr && (r.tags ?? []).includes(name),
      ).length;
      return { label: format(ws, "MMM d"), count };
    });

    // Per-symptom trend: this month vs 2 months ago
    const thisMonthCount = currentRows.filter((r) => (r.tags ?? []).includes(name)).length;
    const twoMonthsAgoCount = twoMonthsAgoRows.filter((r) => (r.tags ?? []).includes(name)).length;

    return {
      name,
      count: tagFreqAll[name],
      trend: "",
      description: "",
      weekly_breakdown: weeklyBreakdown,
    };
  });

  // Breakdown for donut chart: current month's own top 5 + "Other"
  const tagFreqCurrent: Record<string, number> = {};
  for (const r of currentRows) {
    for (const t of r.tags ?? []) {
      tagFreqCurrent[t] = (tagFreqCurrent[t] || 0) + 1;
    }
  }

  const currentTop = Object.entries(tagFreqCurrent).sort((a, b) => b[1] - a[1]);
  const breakdown: { name: string; count: number }[] = [];
  let otherCount = 0;
  for (let i = 0; i < currentTop.length; i++) {
    if (i < 5) breakdown.push({ name: currentTop[i][0], count: currentTop[i][1] });
    else otherCount += currentTop[i][1];
  }
  if (otherCount > 0) {
    breakdown.push({ name: "Other", count: otherCount });
  }

  return {
    total_records: totalRecords,
    distinct_types: distinctTypes,
    active_days: activeDays,
    month_label: monthLabel,
    vs_prev_month_pct: vsPrevMonthPct,
    vs_two_months_pct: vsTwoMonthsPct,
    top_symptoms: topSymptoms,
    breakdown,
  };
}

// ── AI insights generation ───────────────────────────────────

async function generateAiInsights(
  userId: string,
  stats: Omit<ReportData, "things_to_watch">,
  monthStart: string,
  monthEnd: string,
): Promise<{ things_to_watch: ThingToWatch[]; trend_badges: TrendBadge[] }> {
  // Fetch user context: profile, individual doc captions, risk flags, health summaries
  const [profileRes, docUploadsRes, docCtxRes, summariesRes] = await Promise.all([
    supabaseAdmin
      .from("health_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("profile_document_uploads")
      .select("record_id, group_title, group_ai_summary, group_user_summary, ai_summary, created_at")
      .eq("user_id", userId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("user_document_context")
      .select("risk_flags")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("health_summaries")
      .select("level, summary")
      .eq("user_id", userId)
      .eq("is_latest", true)
      .in("level", ["monthly", "quarterly", "biannual"]),
  ]);

  const profile = profileRes.data;
  const riskFlags = docCtxRes.data?.risk_flags ?? [];
  const summaries = summariesRes.data ?? [];

  // Deduplicate by record_id, build per-document entries with date
  const docRows = docUploadsRes.data ?? [];
  const seenRecords = new Set<string>();
  const docEntries: string[] = [];
  for (const d of docRows as Array<{ record_id?: string; id?: string; group_title?: string; group_ai_summary?: string; group_user_summary?: string; ai_summary?: string; created_at?: string }>) {
    const rid = d.record_id ?? d.id ?? "";
    if (seenRecords.has(rid)) continue;
    seenRecords.add(rid);
    const title = (d.group_title ?? "").trim();
    const caption = (d.group_ai_summary ?? d.ai_summary ?? "").trim();
    const userNote = (d.group_user_summary ?? "").trim();
    if (!caption && !title) continue;
    if (title === "Not a health document") continue;
    const uploadDate = d.created_at ? d.created_at.slice(0, 10) : "unknown";
    let entry = `[uploaded ${uploadDate}] ${title}`;
    if (userNote) entry += ` | User note: ${userNote}`;
    entry += ` — ${caption}`;
    docEntries.push(entry);
  }

  const systemPrompt = `You are a medical health analyst generating a monthly health report. Analyze the user's symptom data, health profile, and historical summaries to produce actionable insights.

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
- description: brief explanation of the trend`;

  const topSymptomsInfo = stats.top_symptoms.map((s) => ({
    name: s.name,
    total_3mo_count: s.count,
    weekly_breakdown: s.weekly_breakdown,
  }));

  const userPrompt = `REPORT PERIOD: ${stats.month_label} (${monthStart} to ${monthEnd})

## User Health Profile
${JSON.stringify(profile ?? {}, null, 2)}

## Risk Flags
${riskFlags.length > 0 ? riskFlags.join(", ") : "None"}

## Medical Documents (with upload dates — pay attention to document dates mentioned in the captions)
${docEntries.length > 0 ? docEntries.join("\n") : "No documents uploaded"}

IMPORTANT: When referencing document findings, consider the document's actual date (mentioned in caption) vs the report period. Recent documents are more relevant. Old documents (months ago) should be weighted less unless they indicate chronic/ongoing conditions.

## Recent Health Summaries
${summaries.map((s: { level: string; summary: string }) => `[${s.level}]\n${s.summary}`).join("\n\n")}

## This Month's Stats
- Month: ${stats.month_label}
- Total records: ${stats.total_records}
- Distinct symptom types: ${stats.distinct_types}
- Active days: ${stats.active_days}
- vs Previous month: ${stats.vs_prev_month_pct !== null ? stats.vs_prev_month_pct + "%" : "N/A"}
- vs Two months ago: ${stats.vs_two_months_pct !== null ? stats.vs_two_months_pct + "%" : "N/A"}

## Top Symptoms (3-month window with weekly breakdown)
${JSON.stringify(topSymptomsInfo, null, 2)}

## Symptom Breakdown (current month)
${JSON.stringify(stats.breakdown, null, 2)}

Generate the JSON response with trend_badges and things_to_watch.`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ name: "web_search", type: "web_search_20250305" }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();

  // The response may contain tool_use blocks (web search) before the final text.
  // Anthropic's built-in web_search is server-side; results are included inline.
  // Extract the LAST text block for JSON parsing.
  const textBlocks = (data.content ?? []).filter(
    (b: { type: string }) => b.type === "text",
  );
  const lastText = textBlocks[textBlocks.length - 1]?.text ?? "{}";

  // Strip markdown fences if present
  const cleaned = lastText.replace(/```json\s*|```\s*/g, "").trim();

  const parsed = JSON.parse(cleaned) as {
    trend_badges?: TrendBadge[];
    things_to_watch?: ThingToWatch[];
  };

  return {
    trend_badges: parsed.trend_badges ?? [],
    things_to_watch: parsed.things_to_watch ?? [],
  };
}
