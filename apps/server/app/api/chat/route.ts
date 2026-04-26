import { NextResponse } from "next/server";
import sharp from "sharp";
import mammoth from "mammoth";
import { supabaseAdmin } from "@/lib/supabase";
import { extractPdfText } from "@/lib/pdfText";
import { isPaidUser } from "@/lib/subscription";
import {
  fetchChatContext,
  buildBaseContext,
  buildFullContext,
  getAnthropicChatStaticSystem,
  buildChatUserContextEnvelope,
  analyzeDeepAnalysisNeed,
} from "@/lib/chatContext";
import { normalizeSymptomKeywordsForUserText } from "@/lib/symptomTaxonomy";
import {
  AI_USAGE_FEATURES,
  recordAiUsage,
  tokensFromAnthropicUsage,
} from "@/lib/aiUsage";

const FREE_DAILY_MESSAGE_LIMIT = 3;
const FREE_MAX_MESSAGE_LENGTH = 200;
const MAX_IMAGE_EDGE = 896;
const MAX_CHAT_IMAGES = 5;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Haiku 4.5：官方要求可缓存前缀 ≥4096 tokens，否则 cache_* 全为 0（静默不缓存）。Sonnet 4.6 为 2048。 */
const LAYER1_MODEL = "claude-haiku-4-5-20251001";
const LAYER2_MODEL = "claude-sonnet-4-6";

// ── Anthropic types ──────────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" | "5m" };
};

type AnthropicToolJson = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: "ephemeral"; ttl?: "1h" | "5m" };
};

type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

// ── Helpers ──────────────────────────────────────────────────────

async function imageUrlToJpegBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(buf)
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return jpeg.toString("base64");
}

async function callAnthropic(params: {
  model: string;
  system: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicToolJson[];
  max_tokens: number;
  temperature?: number;
}): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Anthropic prompt-cache prefix hierarchy is tools → system → messages (docs).
  // Build body in that key order so JSON mirrors the logical prefix; server does not
  // use "messages before tools" in wire JSON to mean messages sit between system and tools.
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.max_tokens,
  };
  if (params.tools?.length) body.tools = params.tools;
  body.system = params.system;
  body.messages = params.messages;
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errBody}`);
  }

  return (await res.json()) as AnthropicResponse;
}

/** 开发环境默认 true；生产需 `CHAT_LOG_FULL_PROMPT=1` 或请求头 `x-nvapp-log-full-prompt: 1` */
function shouldLogFullChatPrompt(request: Request): boolean {
  const h = request.headers.get("x-nvapp-log-full-prompt")?.trim().toLowerCase();
  if (h === "1" || h === "true") return true;
  if (process.env.CHAT_LOG_FULL_PROMPT === "1") return true;
  if ((process.env.NODE_ENV ?? "development") !== "production") return true;
  if (process.env.VERCEL_ENV === "preview") return true;
  return false;
}

function redactImageBlocksForLog(messages: AnthropicMessage[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : (m.content as ContentBlock[]).map((b) => {
            if (b.type === "image" && b.source?.type === "base64") {
              const d = b.source.data;
              const n = typeof d === "string" ? d.length : 0;
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: b.source.media_type,
                  data: `[redacted base64, ${n} chars]`,
                },
              };
            }
            return b;
          }),
  }));
}

function logFullChatPrompt(params: {
  requestId: string;
  turn: number;
  model: string;
  system: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  tools: unknown[];
}): void {
  const { requestId, turn, model, system, messages, tools } = params;
  const systemChars =
    typeof system === "string"
      ? system.length
      : system.reduce((n, b) => n + (b.text?.length ?? 0), 0);
  console.info(
    `[chat][full-prompt] requestId=${requestId} turn=${turn} model=${model} systemChars=${systemChars}`,
  );
  console.info(
    "[chat][full-prompt] Order: tools → system → messages (Anthropic cache prefix hierarchy; matches request body key order).",
  );
  console.info("[chat][full-prompt] ----- tools -----");
  try {
    console.info(JSON.stringify(tools, null, 2));
  } catch (e) {
    console.warn("[chat][full-prompt] tools JSON failed:", e);
  }
  console.info("[chat][full-prompt] ----- system -----");
  if (typeof system === "string") console.info(system);
  else console.info(JSON.stringify(system, null, 2));
  console.info("[chat][full-prompt] ----- messages (image base64 redacted) -----");
  try {
    console.info(JSON.stringify(redactImageBlocksForLog(messages), null, 2));
  } catch (e) {
    console.warn("[chat][full-prompt] messages JSON failed:", e);
  }
}

function contentToBlocks(content: string | ContentBlock[]): ContentBlock[] {
  return typeof content === "string" ? [{ type: "text" as const, text: content }] : content;
}

/** 动态用户上下文进首条 user（<context>）+ 固定 ack assistant，再接历史与当前 user blocks。 */
function buildInitialAnthropicMessages(params: {
  dynamicMarkdown: string;
  history: AnthropicMessage[];
  currentUserBlocks: ContentBlock[];
}): AnthropicMessage[] {
  const msgs: AnthropicMessage[] = [
    { role: "user", content: buildChatUserContextEnvelope(params.dynamicMarkdown) },
    { role: "assistant", content: "Got it, I have your context." },
    ...params.history,
  ];
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user") {
    last.content = [...contentToBlocks(last.content), ...params.currentUserBlocks];
  } else {
    msgs.push({ role: "user", content: params.currentUserBlocks });
  }
  return msgs;
}

function ensureAlternating(
  history: Array<{ role: "user" | "assistant"; content: string }>
): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  for (const m of history) {
    const last = result[result.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content as string}\n${m.content}`;
    } else {
      result.push({ role: m.role, content: m.content });
    }
  }
  if (result.length > 0 && result[0].role === "assistant") {
    result.shift();
  }
  return result;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ── Tool definition (Anthropic format) ───────────────────────────

const TIME_OF_DAY_HOURS: Record<string, number> = {
  early_morning: 4,
  morning: 9,
  noon: 12,
  afternoon: 15,
  evening: 20,
  night: 23,
};

/** Anthropic tool_result for log_symptom (create-only; no record_id). */
function logSymptomToolResultJson(success: boolean, error?: string): string {
  if (success) return JSON.stringify({ success: true });
  return JSON.stringify({ success: false, error: error ?? "failed" });
}

const LOG_SYMPTOM_TOOL = {
  name: "log_symptom",
  description:
    "Create a new health observation record. Do NOT call for questions, follow-ups, historical analysis, or general chat — only when the user provides NEW health information. This tool cannot modify or delete existing records; if the user asks to fix or remove a past entry, do not call this tool — instead, instruct them to edit it directly in the timeline. See system prompt for call-count rules, keyword rules, optional local_date, and tool result JSON shape.",
  input_schema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description:
          "Natural first-person description of the observation. If local_date is a past day vs session App calendar, do NOT leave 昨天/前天/yesterday-style phrases in content — rewrite so the text reads correctly on that day's timeline card (see system prompt).",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Tags per category: symptom_feeling → 1-2 mid-level tags (body region or symptom class, no invented diagnoses, no vague umbrellas); medication_supplement → drug/supplement names; diet/behavior_treatment → []",
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "high", "positive"],
        description:
          "Estimated severity. 'positive' for good states (exercised, slept well, feeling great).",
      },
      time_of_day: {
        type: "string",
        enum: ["early_morning", "morning", "noon", "afternoon", "evening", "night", "now"],
        description: "When it occurred. 'now' if unspecified.",
      },
      category: {
        type: "string",
        enum: ["symptom_feeling", "diet", "medication_supplement", "behavior_treatment"],
        description:
          "symptom_feeling: symptoms/feelings/emotions; diet: food/drink; medication_supplement: meds/supplements/vitamins; behavior_treatment: exercise/therapy/doctor visits. Default: symptom_feeling.",
      },
      local_date: {
        type: "string",
        description:
          "Optional. YYYY-MM-DD calendar day for this row when the user names a specific day or multi-day logging; see App calendar in context. Omit for today / 刚刚 / 现在 / no date clue.",
      },
    },
    required: ["content", "keywords", "severity", "time_of_day", "category"],
  },
};

const FETCH_HEALTH_HISTORY_TOOL = {
  name: "fetch_health_history",
  description:
    "Retrieve the user's health summaries for a past period. Use when the user asks about trends, patterns, historical symptoms, or references timeframes like 'last month' or 'recently'. Choose the shortest period that covers the question. Do NOT call for current/today's symptoms — those are already in context.",
  input_schema: {
    type: "object" as const,
    properties: {
      period: {
        type: "string",
        enum: ["monthly", "quarterly", "biannual"],
        description: "Shortest period covering the user's question.",
      },
    },
    required: ["period"],
  },
};

const LIST_DOCUMENTS_TOOL = {
  name: "list_documents",
  description:
    "List the user's uploaded medical documents including lab reports, prescriptions, checkup results, and imaging reports. Returns document titles, upload dates, and record_ids. Call this first when the user mentions their medical records, test results, or checkups — then use fetch_document_detail with the relevant record_id to get full content.",
  input_schema: {
    type: "object" as const,
    properties: {},
  },
};

const FETCH_DOCUMENT_DETAIL_TOOL = {
  name: "fetch_document_detail",
  description:
    "Retrieve the AI-generated summary of a specific medical document by its record_id. Always call list_documents first to obtain available record_ids, then call this tool with the relevant record_id to get the full parsed content of that document.",
  input_schema: {
    type: "object" as const,
    properties: {
      record_id: {
        type: "string",
        description: "record_id from list_documents results",
      },
    },
    required: ["record_id"],
  },
};

const CHAT_ANTHROPIC_TOOLS = [
  LOG_SYMPTOM_TOOL,
  FETCH_HEALTH_HISTORY_TOOL,
  LIST_DOCUMENTS_TOOL,
  FETCH_DOCUMENT_DETAIL_TOOL,
];

/** Anthropic：仅在最后一个 tool 上设 cache_control（与单块 system 形成稳定可缓存前缀）。 */
function getChatAnthropicToolsWithCache(): AnthropicToolJson[] {
  const n = CHAT_ANTHROPIC_TOOLS.length;
  return CHAT_ANTHROPIC_TOOLS.map((tool, i) =>
    i === n - 1
      ? { ...tool, cache_control: { type: "ephemeral" as const, ttl: "5m" as const } }
      : { ...tool },
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-nvapp-mock-tier, x-nvapp-log-full-prompt",
};

// ── Route ────────────────────────────────────────────────────────

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reqStart = Date.now();
  const timings: Record<string, number> = {};
  const mark = (key: string, startMs: number) => {
    timings[key] = Date.now() - startMs;
  };
  const flushTiming = (status: "ok" | "error") => {
    console.info(
      "[chat][timing]",
      JSON.stringify({ requestId, status, totalMs: Date.now() - reqStart, timings })
    );
  };

  // ── Auth ──────────────────────────────────────────────────────
  const authStart = Date.now();
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    mark("auth", authStart);
    flushTiming("error");
    return NextResponse.json(
      { error: "未登录，请先完成认证" },
      { status: 401, headers: corsHeaders }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  mark("auth", authStart);
  const userId = user?.id ?? null;
  if (!userId) {
    console.error("[chat] auth failed:", authError?.message);
    flushTiming("error");
    return NextResponse.json(
      { error: "认证失效，请重新登录" },
      { status: 401, headers: corsHeaders }
    );
  }

  // ── Parse body ────────────────────────────────────────────────
  const parseBodyStart = Date.now();
  const body = await request.json().catch(() => ({}));
  mark("parseBody", parseBodyStart);

  const { message, localDate, imageUrls, imagePaths } = body as {
    message?: string;
    localDate?: string;
    imageUrls?: string[];
    imagePaths?: Array<{ bucket?: string; path?: string }>;
  };

  const text =
    typeof message === "string" && message.trim() ? message.trim() : "(空)";

  const rawUrls = Array.isArray(imageUrls)
    ? imageUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const rawPaths = Array.isArray(imagePaths)
    ? imagePaths.filter(
        (p): p is { bucket: string; path: string } =>
          typeof p?.bucket === "string" && typeof p?.path === "string"
      )
    : [];

  if (rawUrls.length > MAX_CHAT_IMAGES || rawPaths.length > MAX_CHAT_IMAGES) {
    flushTiming("error");
    return NextResponse.json(
      { error: `每条消息最多 ${MAX_CHAT_IMAGES} 张图片` },
      { status: 400, headers: corsHeaders }
    );
  }

  let urls = rawUrls;
  const pathsToStore = rawPaths;
  if (urls.length === 0 && pathsToStore.length > 0) {
    const signed = await Promise.all(
      pathsToStore.map(async (p) => {
        const { data } = await supabaseAdmin.storage
          .from(p.bucket)
          .createSignedUrl(p.path, 3600);
        return data?.signedUrl ?? "";
      })
    );
    urls = signed.filter(Boolean);
  }

  const dateStr =
    typeof localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(localDate)
      ? localDate
      : new Date().toISOString().slice(0, 10);

  // ── Free-user limits ──────────────────────────────────────────
  const mockTierHeaderRaw = request.headers.get("x-nvapp-mock-tier");
  const mockTierHeader = mockTierHeaderRaw?.trim().toLowerCase() ?? "";
  const isNonProd =
    (process.env.NODE_ENV ?? "development") !== "production" ||
    (process.env.VERCEL_ENV ?? "development") !== "production";
  const allowMockTierBypass =
    isNonProd && (mockTierHeader === "pro" || mockTierHeader === "prime");
  const paid = allowMockTierBypass ? true : await isPaidUser(userId);

  if (!paid) {
    if (urls.length > 0 || pathsToStore.length > 0) {
      flushTiming("error");
      return NextResponse.json(
        { error: "免费用户无法在对话中上传图片。升级解锁图片问诊。" },
        { status: 403, headers: corsHeaders }
      );
    }
    if (text.length > FREE_MAX_MESSAGE_LENGTH) {
      flushTiming("error");
      return NextResponse.json(
        { error: `免费用户单条消息限 ${FREE_MAX_MESSAGE_LENGTH} 字。升级解锁更长输入。` },
        { status: 403, headers: corsHeaders }
      );
    }
    const { count } = await supabaseAdmin
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .eq("local_date", dateStr);
    if ((count ?? 0) >= FREE_DAILY_MESSAGE_LIMIT) {
      flushTiming("error");
      return NextResponse.json(
        { error: "今日免费消息已达上限（3条），明日可继续或升级解锁无限对话。" },
        { status: 403, headers: corsHeaders }
      );
    }
  }

  // ── Fetch context ─────────────────────────────────────────────
  const ctxStart = Date.now();
  const ctx = await fetchChatContext(userId, dateStr);
  mark("fetchContext", ctxStart);

  // ── Insert user message ───────────────────────────────────────
  const insertUserStart = Date.now();
  const userMeta = pathsToStore.length > 0 ? { imagePaths: pathsToStore } : {};
  const { data: userMsg, error: insertUserErr } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      user_id: userId,
      role: "user",
      content: text,
      local_date: dateStr,
      meta: userMeta,
    })
    .select("id")
    .single();
  mark("insertUserMessage", insertUserStart);

  if (insertUserErr) {
    console.error("chat_messages insert user:", insertUserErr);
    flushTiming("error");
    return NextResponse.json(
      { error: "保存用户消息失败" },
      { status: 500, headers: corsHeaders }
    );
  }
  const sourceMessageId = userMsg?.id ?? null;

  // ── Build context strings ─────────────────────────────────────
  const baseContext = buildBaseContext({
    sessionLocalDate: dateStr,
    profile: ctx.profile,
    riskFlags: ctx.riskFlags,
    thisWeekLogs: ctx.thisWeekLogs,
    rollingWeeklySummary: ctx.summaryMap["rolling_weekly"] ?? null,
  });

  // ── Check API key ─────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[chat] ANTHROPIC_API_KEY not set");
    const fallbackReply = "服务配置有误，请稍后再试。";
    await supabaseAdmin.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: fallbackReply,
      local_date: dateStr,
    });
    flushTiming("error");
    return NextResponse.json(
      { reply: fallbackReply, dailyLogUpdated: false, deepAnalysis: false },
      { headers: corsHeaders }
    );
  }

  // ── Build user content blocks (text + optional images/files) ────
  const DOC_EXTS = new Set(["pdf", "docx", "doc", "txt", "md"]);
  const userContentBlocks: ContentBlock[] = [{ type: "text", text }];

  // Separate doc files from images
  const docPaths = pathsToStore.filter((p) => {
    const ext = p.path.split(".").pop()?.toLowerCase() ?? "";
    return DOC_EXTS.has(ext);
  });
  const imgPaths = pathsToStore.filter((p) => {
    const ext = p.path.split(".").pop()?.toLowerCase() ?? "";
    return !DOC_EXTS.has(ext);
  });

  // Extract text from document files
  for (const dp of docPaths) {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from(dp.bucket).download(dp.path);
      if (!fileData) continue;
      const buf = Buffer.from(await fileData.arrayBuffer());
      const ext = dp.path.split(".").pop()?.toLowerCase() ?? "";
      let extractedText = "";
      if (ext === "pdf") {
        extractedText = await extractPdfText(buf);
      } else if (ext === "docx" || ext === "doc") {
        const result = await mammoth.extractRawText({ buffer: buf });
        extractedText = result.value;
      } else {
        extractedText = buf.toString("utf-8");
      }
      const trimmed = extractedText.trim().slice(0, 30000);
      if (trimmed) {
        const fileName = dp.path.split("/").pop() ?? "file";
        userContentBlocks.push({
          type: "text",
          text: `[Attached file: ${fileName}]\n${trimmed}`,
        });
      }
    } catch (e) {
      console.warn("[chat] doc extract failed:", (e as Error)?.message);
    }
  }

  // Process image URLs (from signed URLs or image paths)
  let imgUrls = urls.filter((u) => {
    const hasDocPath = docPaths.some((dp) => u.includes(dp.path.split("/").pop() ?? "__none__"));
    return !hasDocPath;
  });
  if (imgUrls.length === 0 && imgPaths.length > 0) {
    const signed = await Promise.all(
      imgPaths.map(async (p) => {
        const { data } = await supabaseAdmin.storage.from(p.bucket).createSignedUrl(p.path, 3600);
        return data?.signedUrl ?? "";
      })
    );
    imgUrls = signed.filter(Boolean);
  }
  if (imgUrls.length > 0) {
    const imgResults = await Promise.all(
      imgUrls.map(async (url) => {
        try {
          const b64 = await imageUrlToJpegBase64(url);
          return {
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg", data: b64 },
          };
        } catch (e) {
          console.warn("[chat] image convert failed, skipping:", (e as Error)?.message);
          return null;
        }
      })
    );
    for (const img of imgResults) {
      if (img) userContentBlocks.push(img);
    }
  }

  // ── Build message history for Anthropic ───────────────────────
  const historyMessages = ensureAlternating(
    ctx.recentHistory.map(({ role, content }) => ({ role, content })),
  );

  // ── Routing: decide Layer1 vs Layer2 before calling ────────────
  let reply = "";
  let dailyLogUpdated = false;
  let deepAnalysis = false;

  const routing = analyzeDeepAnalysisNeed({
    message: text,
    riskFlags: ctx.riskFlags,
    imageCount: urls.length,
    hasEmptyText: text === "(空)" || text.trim().length === 0,
  });
  console.info("[chat][routing]", JSON.stringify({
    requestId, score: routing.score, escalate: routing.shouldEscalate, reasons: routing.reasons,
  }));

  const useLayer2 = routing.shouldEscalate;
  if (useLayer2) deepAnalysis = true;

  const selectedModel = useLayer2 ? LAYER2_MODEL : LAYER1_MODEL;
  const dynamicUserContextMarkdown = useLayer2
    ? buildFullContext(baseContext, {
        monthlySummary: ctx.summaryMap["monthly"] ?? null,
        quarterlySummary: ctx.summaryMap["quarterly"] ?? null,
        biannualSummary: ctx.summaryMap["biannual"] ?? null,
        docsSummary: ctx.docsSummary,
      })
    : baseContext;
  const selectedSystemForApi = getAnthropicChatStaticSystem();
  const cachedToolsForApi = getChatAnthropicToolsWithCache();
  const selectedMaxTokens = useLayer2 ? 2048 : 1024;

  try {
    let currentMessages = buildInitialAnthropicMessages({
      dynamicMarkdown: dynamicUserContextMarkdown,
      history: historyMessages,
      currentUserBlocks: userContentBlocks,
    });
    let maxTurns = 5;
    let chatLlmTurn = 0;
    const logFullPrompt = shouldLogFullChatPrompt(request);

    const llmStart = Date.now();
    while (maxTurns-- > 0) {
      chatLlmTurn += 1;
      if (logFullPrompt) {
        logFullChatPrompt({
          requestId,
          turn: chatLlmTurn,
          model: selectedModel,
          system: selectedSystemForApi,
          messages: currentMessages,
          tools: cachedToolsForApi,
        });
      }
      const resp = await callAnthropic({
        model: selectedModel,
        system: selectedSystemForApi,
        messages: currentMessages,
        tools: cachedToolsForApi,
        max_tokens: selectedMaxTokens,
        ...(useLayer2 ? { temperature: 0 } : {}),
      });

      const usageTok = tokensFromAnthropicUsage(resp.usage);
      const cacheCreate = resp.usage?.cache_creation_input_tokens;
      const cacheRead = resp.usage?.cache_read_input_tokens;
      const cacheCreate5m = (resp.usage as { cache_creation?: { ephemeral_5m_input_tokens?: number } } | undefined)
        ?.cache_creation?.ephemeral_5m_input_tokens;
      const cacheCreate1h = (resp.usage as { cache_creation?: { ephemeral_1h_input_tokens?: number } } | undefined)
        ?.cache_creation?.ephemeral_1h_input_tokens;
      console.info(
        "[chat][anthropic-usage]",
        JSON.stringify({
          requestId,
          turn: chatLlmTurn,
          model: selectedModel,
          layer: useLayer2 ? "layer2" : "layer1",
          usage: resp.usage ?? null,
        }),
      );
      console.info(
        "[chat][anthropic-cache]",
        JSON.stringify({
          requestId,
          turn: chatLlmTurn,
          cache_creation_input_tokens: cacheCreate ?? 0,
          cache_read_input_tokens: cacheRead ?? 0,
          ephemeral_5m_input_tokens: cacheCreate5m ?? 0,
          ephemeral_1h_input_tokens: cacheCreate1h ?? 0,
          note:
            (cacheRead ?? 0) > 0
              ? "cache_read>0: stable prefix likely hit"
              : (cacheCreate ?? 0) > 0
                ? "cache_creation>0: new or refreshed cache write"
                : "both zero: prefix too short or cache_control mismatch (Haiku needs ~4096+ tokens with tools)",
        }),
      );
      void recordAiUsage({
        userId,
        feature: AI_USAGE_FEATURES.chat,
        provider: "anthropic",
        model: selectedModel,
        inputTokens: usageTok.inputTokens,
        outputTokens: usageTok.outputTokens,
        metadata: {
          requestId,
          deepAnalysis: useLayer2,
          turn: chatLlmTurn,
          stopReason: resp.stop_reason,
          layer: useLayer2 ? "layer2" : "layer1",
          ...(cacheCreate != null && cacheCreate > 0
            ? { cache_creation_input_tokens: cacheCreate }
            : {}),
          ...(cacheRead != null && cacheRead > 0 ? { cache_read_input_tokens: cacheRead } : {}),
        },
      });

      console.log(`[chat] ${useLayer2 ? "layer2" : "layer1"} response:`, JSON.stringify({
        stop_reason: resp.stop_reason,
        blocks: resp.content.map((b) =>
          b.type === "text"
            ? { type: "text", preview: b.text.slice(0, 120) }
            : b.type === "tool_use"
              ? { type: "tool_use", name: b.name }
              : { type: b.type }
        ),
      }));

      // ── tool_use → log symptom ──
      if (resp.stop_reason === "tool_use") {
        const toolBlocks = resp.content.filter(
          (b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use"
        );

        currentMessages.push({ role: "assistant", content: resp.content });

        const toolResults: ContentBlock[] = [];
        for (const tb of toolBlocks) {
          // ── log_symptom ──
          if (tb.name === "log_symptom") {
            const input = tb.input as {
              content?: string;
              keywords?: string[];
              severity?: string;
              time_of_day?: string;
              category?: string;
              local_date?: string;
            };
            const summary =
              typeof input.content === "string" && input.content.trim()
                ? input.content.trim()
                : null;

            if (!summary) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: logSymptomToolResultJson(false, "missing or empty content"),
              });
              continue;
            }

            const validCategories = ["symptom_feeling", "diet", "medication_supplement", "behavior_treatment"];
            const category = validCategories.includes(input.category ?? "")
              ? input.category!
              : "symptom_feeling";

            const needsKeywords = category === "symptom_feeling" || category === "medication_supplement";
            const rawKeywords = needsKeywords && Array.isArray(input.keywords)
              ? input.keywords.filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim())
              : [];
            const userTextForKeywords = text !== "(空)" ? text : summary;
            const keywords =
              rawKeywords.length > 0 && category === "symptom_feeling"
                ? normalizeSymptomKeywordsForUserText(userTextForKeywords, rawKeywords)
                : rawKeywords;
            const severity =
              input.severity === "low" || input.severity === "medium" || input.severity === "high" || input.severity === "positive"
                ? input.severity
                : null;
            const meta: Record<string, unknown> = {};
            if (keywords.length > 0) meta.symptom_keywords = keywords;

            const rawLd =
              typeof input.local_date === "string" ? input.local_date.trim() : "";
            const parsedLd = /^\d{4}-\d{2}-\d{2}$/.test(rawLd) ? rawLd : dateStr;
            const logLocalDate = parsedLd > dateStr ? dateStr : parsedLd;

            const tod = typeof input.time_of_day === "string" ? input.time_of_day : "now";
            let createdAt: string | undefined;
            if (tod !== "now" && tod in TIME_OF_DAY_HOURS) {
              const hour = TIME_OF_DAY_HOURS[tod];
              createdAt = `${logLocalDate}T${String(hour).padStart(2, "0")}:00:00+08:00`;
              if (input.time_of_day) meta.time_of_day = input.time_of_day;
            }

            const rowPayload: Record<string, unknown> = {
              local_date: logLocalDate,
              summary,
              tags: keywords,
              severity,
              category,
              source_message_id: sourceMessageId,
              meta,
            };
            if (createdAt) rowPayload.created_at = createdAt;

            const insertPayload: Record<string, unknown> = {
              user_id: userId,
              ...rowPayload,
            };

            const { data: inserted, error: logErr } = await supabaseAdmin
              .from("symptom_summaries")
              .insert(insertPayload)
              .select("id")
              .maybeSingle();

            if (logErr || !inserted?.id) {
              if (logErr) console.error("symptom_summaries insert:", logErr);
              toolResults.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: logSymptomToolResultJson(false, "insert failed"),
              });
              continue;
            }

            dailyLogUpdated = true;
            toolResults.push({
              type: "tool_result",
              tool_use_id: tb.id,
              content: logSymptomToolResultJson(true),
            });
            continue;
          }

          // ── fetch_health_history ──
          if (tb.name === "fetch_health_history") {
            const input = tb.input as { period?: string };
            const period = input.period ?? "monthly";
            const levelMap: Record<string, string> = {
              monthly: "monthly",
              quarterly: "quarterly",
              biannual: "biannual",
            };
            const level = levelMap[period] ?? "monthly";

            const { data: sumRow } = await supabaseAdmin
              .from("health_summaries")
              .select("summary")
              .eq("user_id", userId)
              .eq("level", level)
              .eq("is_latest", true)
              .maybeSingle();

            const content = sumRow?.summary
              ? `[${period} health summary]\n${sumRow.summary}`
              : `No ${period} health summary available yet.`;

            toolResults.push({
              type: "tool_result",
              tool_use_id: tb.id,
              content,
            });
            continue;
          }

          // ── list_documents ──
          if (tb.name === "list_documents") {
            const { data: docs } = await supabaseAdmin
              .from("profile_document_uploads")
              .select("record_id, group_title, created_at")
              .eq("user_id", userId)
              .eq("status", "ready")
              .order("created_at", { ascending: false })
              .limit(30);

            const seen = new Set<string>();
            const entries: string[] = [];
            for (const d of docs ?? []) {
              const rid = d.record_id ?? (d as any).id;
              if (seen.has(rid)) continue;
              seen.add(rid);
              const title = (d.group_title ?? "").trim();
              if (!title || title === "Not a health document") continue;
              const date = d.created_at ? d.created_at.slice(0, 10) : "unknown";
              entries.push(`- [${date}] ${title} (record_id: ${rid})`);
            }

            const content = entries.length > 0
              ? `User has ${entries.length} documents:\n${entries.join("\n")}`
              : "No medical documents uploaded.";

            toolResults.push({
              type: "tool_result",
              tool_use_id: tb.id,
              content,
            });
            continue;
          }

          // ── fetch_document_detail ──
          if (tb.name === "fetch_document_detail") {
            const input = tb.input as { record_id?: string };
            const recordId = input.record_id;

            if (!recordId) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: "Missing record_id parameter.",
              });
              continue;
            }

            const { data: doc } = await supabaseAdmin
              .from("profile_document_uploads")
              .select("record_id, group_title, group_ai_summary, group_user_summary, ai_summary, created_at")
              .eq("user_id", userId)
              .eq("record_id", recordId)
              .eq("status", "ready")
              .limit(1)
              .maybeSingle();

            if (!doc) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: `Document with record_id "${recordId}" not found.`,
              });
              continue;
            }

            const title = (doc.group_title ?? "").trim();
            const aiSummary = (doc.group_ai_summary ?? doc.ai_summary ?? "").trim();
            const userNote = (doc.group_user_summary ?? "").trim();
            const date = doc.created_at ? doc.created_at.slice(0, 10) : "unknown";

            let content = `[Document: ${title}]\nUploaded: ${date}\n`;
            if (userNote) content += `User note: ${userNote}\n`;
            content += `AI Summary: ${aiSummary || "No summary available."}`;

            toolResults.push({
              type: "tool_result",
              tool_use_id: tb.id,
              content,
            });
            continue;
          }

          // ── Unknown tool ──
          toolResults.push({
            type: "tool_result",
            tool_use_id: tb.id,
            content: "Unknown tool.",
          });
        }

        currentMessages.push({ role: "user", content: toolResults });
        continue;
      }

      reply = extractText(resp.content);
      break;
    }
    mark(useLayer2 ? "layer2" : "layer1", llmStart);

    if (!reply) reply = "抱歉，我暂时无法回复。";
  } catch (e) {
    console.error("[chat] Anthropic error:", e);
    reply = "请求失败，请稍后再试。";
  }

  // ── Save assistant message ────────────────────────────────────
  const insertAssistantStart = Date.now();
  const assistantMeta: Record<string, unknown> = {};
  if (deepAnalysis) assistantMeta.deepAnalysis = true;
  await supabaseAdmin.from("chat_messages").insert({
    user_id: userId,
    role: "assistant",
    content: reply,
    local_date: dateStr,
    ...(Object.keys(assistantMeta).length > 0 ? { meta: assistantMeta } : {}),
  });
  mark("insertAssistantMessage", insertAssistantStart);
  flushTiming("ok");

  return NextResponse.json(
    { reply, dailyLogUpdated, deepAnalysis, routingScore: routing?.score, routingReasons: routing?.reasons },
    { headers: corsHeaders }
  );
}
