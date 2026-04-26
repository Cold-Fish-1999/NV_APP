import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type Row = {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  source: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  feature: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * 当前登录用户的 ai_usage_events 聚合（OpenAI / Anthropic），供调试与 Test UI。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "未登录" }, { status: 401, headers: corsHeaders });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  const userId = user?.id ?? null;
  if (!userId) {
    console.error("[ai-usage-summary] auth failed:", authError?.message);
    return NextResponse.json({ error: "认证失效" }, { status: 401, headers: corsHeaders });
  }

  const { searchParams } = new URL(request.url);
  const daysRaw = searchParams.get("days");
  const days = Math.min(366, Math.max(1, parseInt(daysRaw ?? "30", 10) || 30));
  const includeDetails =
    searchParams.get("details") === "1" || searchParams.get("events") === "1";
  const eventLimit = Math.min(
    500,
    Math.max(0, parseInt(searchParams.get("eventLimit") ?? "150", 10) || 150),
  );
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const { data, error } = await supabaseAdmin
    .from("ai_usage_events")
    .select(
      "id, created_at, provider, model, source, input_tokens, output_tokens, feature, metadata",
    )
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ai-usage-summary]", error.message);
    return NextResponse.json(
      { error: "读取用量失败" },
      { status: 500, headers: corsHeaders }
    );
  }

  const rows = (data ?? []) as Row[];

  const byProvider = {
    openai: { inputTokens: 0, outputTokens: 0, calls: 0 },
    anthropic: { inputTokens: 0, outputTokens: 0, calls: 0 },
  };

  const byFeature: Record<string, { inputTokens: number; outputTokens: number; calls: number }> =
    {};

  let totalIn = 0;
  let totalOut = 0;

  for (const row of rows) {
    const inn = Math.max(0, row.input_tokens ?? 0);
    const out = Math.max(0, row.output_tokens ?? 0);
    totalIn += inn;
    totalOut += out;

    if (row.provider === "openai" || row.provider === "anthropic") {
      const b = byProvider[row.provider];
      b.inputTokens += inn;
      b.outputTokens += out;
      b.calls += 1;
    }

    const f = row.feature?.trim() || "unknown";
    if (!byFeature[f]) {
      byFeature[f] = { inputTokens: 0, outputTokens: 0, calls: 0 };
    }
    byFeature[f].inputTokens += inn;
    byFeature[f].outputTokens += out;
    byFeature[f].calls += 1;
  }

  const events =
    includeDetails && eventLimit > 0
      ? rows.slice(0, eventLimit).map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          provider: r.provider,
          model: r.model,
          feature: r.feature ?? "unknown",
          source: r.source ?? "next_server",
          inputTokens: Math.max(0, r.input_tokens ?? 0),
          outputTokens: Math.max(0, r.output_tokens ?? 0),
          metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : null,
        }))
      : undefined;

  return NextResponse.json(
    {
      since: sinceIso,
      days,
      totalCalls: rows.length,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      byProvider,
      byFeature,
      ...(events ? { events, eventLimit } : {}),
    },
    { headers: corsHeaders }
  );
}
