import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isPaidUser } from "@/lib/subscription";
import { normalizeKeywords } from "@/lib/symptomTaxonomy";

/**
 * 付费用户：从单条手动健康记录（症状/用药纯文本）抽取 keywords + severity。
 * 不读聊天历史、不注入档案摘要、不提供 tools —— 与 POST /api/chat 完全分离。
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const META_MODEL = "claude-haiku-4-5-20251001";
const MAX_DESCRIPTION_LEN = 8000;
const MAX_OUTPUT_TOKENS = 512;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-nvapp-mock-tier",
};

type ContentBlock = { type: "text"; text: string } | { type: string; [k: string]: unknown };

type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: string;
};

function systemPromptSymptom(): string {
  return [
    "You extract metadata from exactly one user-written symptom or feeling record.",
    'Respond with ONLY a JSON object: {"keywords":["..."],"severity":"low"|"medium"|"high"|"positive"}.',
    "keywords: up to 5 short phrases in the user's language or English; no duplicates.",
    "severity: how intense or impactful the symptom is, or positive if they report improvement.",
    "No markdown fences, no explanation, no other keys.",
  ].join(" ");
}

function systemPromptMedication(): string {
  return [
    "You extract metadata from exactly one user-written medication or supplement log.",
    'Respond with ONLY JSON: {"keywords":["..."],"severity":"low"|"medium"|"high"|"positive"}.',
    "keywords: up to 5 canonical drug or supplement names (user language or English).",
    'severity: how they feel after taking if mentioned; otherwise use "medium".',
    "No markdown fences, no explanation, no other keys.",
  ].join(" ");
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseMetaJson(raw: string): { keywords: string[]; severity: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { keywords?: unknown; severity?: unknown };
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 5)
      : [];
    const sev = typeof parsed.severity === "string" ? parsed.severity.trim().toLowerCase() : "";
    const severity = ["low", "medium", "high", "positive"].includes(sev) ? sev : "medium";
    return { keywords, severity };
  } catch {
    return null;
  }
}

async function callAnthropic(system: string, userText: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: META_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  return extractText(data.content ?? []);
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json(
      { error: "未登录，请先完成认证" },
      { status: 401, headers: corsHeaders }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  const userId = user?.id ?? null;
  if (!userId) {
    console.error("[health-record-meta] auth failed:", authError?.message);
    return NextResponse.json(
      { error: "认证失效，请重新登录" },
      { status: 401, headers: corsHeaders }
    );
  }

  const mockTierHeaderRaw = request.headers.get("x-nvapp-mock-tier");
  const mockTierHeader = mockTierHeaderRaw?.trim().toLowerCase() ?? "";
  const isNonProd =
    (process.env.NODE_ENV ?? "development") !== "production" ||
    (process.env.VERCEL_ENV ?? "development") !== "production";
  const allowMockTierBypass =
    isNonProd && (mockTierHeader === "pro" || mockTierHeader === "prime");
  const paid = allowMockTierBypass ? true : await isPaidUser(userId);
  if (!paid) {
    return NextResponse.json(
      { error: "此功能需要 Pro 订阅" },
      { status: 403, headers: corsHeaders }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { description, category } = body as {
    description?: string;
    category?: "symptom_feeling" | "medication_supplement";
  };

  const text =
    typeof description === "string" ? description.trim().slice(0, MAX_DESCRIPTION_LEN) : "";
  if (!text) {
    return NextResponse.json(
      { error: "缺少有效的 description" },
      { status: 400, headers: corsHeaders }
    );
  }

  const isMed = category === "medication_supplement";
  const system = isMed ? systemPromptMedication() : systemPromptSymptom();

  try {
    const raw = await callAnthropic(system, text);
    const parsed = parseMetaJson(raw);
    if (!parsed) {
      return NextResponse.json(
        { keywords: [], severity: "medium", error: "parse_failed" },
        { status: 200, headers: corsHeaders }
      );
    }
    const keywords = isMed ? parsed.keywords : normalizeKeywords(parsed.keywords);
    return NextResponse.json(
      { keywords, severity: parsed.severity },
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error("[health-record-meta]", (e as Error)?.message ?? e);
    return NextResponse.json(
      { error: "元数据生成失败，请稍后重试" },
      { status: 502, headers: corsHeaders }
    );
  }
}
