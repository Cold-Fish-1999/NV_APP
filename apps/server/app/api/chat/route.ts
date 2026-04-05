import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { isPaidUser } from "@/lib/subscription";
import {
  fetchChatContext,
  buildBaseContext,
  buildFullContext,
  buildSystemPrompt,
  analyzeDeepAnalysisNeed,
} from "@/lib/chatContext";
import { normalizeKeywords } from "@/lib/symptomTaxonomy";

const FREE_DAILY_MESSAGE_LIMIT = 3;
const FREE_MAX_MESSAGE_LENGTH = 200;
const MAX_IMAGE_EDGE = 896;
const MAX_CHAT_IMAGES = 5;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
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

type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage?: { input_tokens: number; output_tokens: number };
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
  system: string;
  messages: AnthropicMessage[];
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  max_tokens: number;
  temperature?: number;
}): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    messages: params.messages,
  };
  if (params.tools?.length) body.tools = params.tools;
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

const LOG_SYMPTOM_TOOL = {
  name: "log_symptom",
  description:
    "Record a symptom or health observation the user just described. " +
    "Call this when the user mentions a current symptom, feeling, or health behavior. " +
    "Do NOT call this for questions, historical analysis, or general conversation.",
  input_schema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The symptom description, written naturally in first person",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Symptom/feeling keyword tags ONLY. Rules: " +
          "1) Only include keywords for actual symptoms or physical/emotional feelings " +
          "(e.g. 'headache', 'fatigue', 'anxiety', '头痛', '失眠', '焦虑'). " +
          "2) If the record is about food intake, exercise, medication, or other " +
          "health behaviors with NO symptom or feeling mentioned, return an empty array []. " +
          "3) Use short, generic, canonical terms (e.g. 'headache' not 'splitting headache', " +
          "'头痛' not '头疼得厉害'). Downstream normalization will map variants, " +
          "but prefer standard terms when possible. " +
          "4) One keyword per distinct symptom; avoid duplicates or overlapping terms.",
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "high", "positive"],
        description:
          "Estimated severity based on how the user describes it. " +
          "Use 'positive' for good states like exercised, slept well, feeling great.",
      },
      time_of_day: {
        type: "string",
        enum: ["early_morning", "morning", "noon", "afternoon", "evening", "night", "now"],
        description:
          "When the symptom occurred based on the user's description. " +
          "early_morning=凌晨(~4am), morning=早上/上午(~9am), noon=中午(~12pm), " +
          "afternoon=下午(~3pm), evening=傍晚/晚上(~8pm), night=深夜(~11pm), " +
          "now=just now or no time mentioned (uses current time)",
      },
    },
    required: ["content", "keywords", "severity", "time_of_day"],
  },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-nvapp-mock-tier",
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

  // ── Build user content blocks (text + optional images) ────────
  const userContentBlocks: ContentBlock[] = [{ type: "text", text }];
  if (urls.length > 0) {
    const imgResults = await Promise.all(
      urls.map(async (url) => {
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
  const historyMessages = ensureAlternating(ctx.recentHistory);

  const buildMessages = (extraUserContent: ContentBlock[]): AnthropicMessage[] => {
    const msgs: AnthropicMessage[] = [...historyMessages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === "user") {
      last.content = [
        ...(typeof last.content === "string"
          ? [{ type: "text" as const, text: last.content }]
          : (last.content as ContentBlock[])),
        ...extraUserContent,
      ];
    } else {
      msgs.push({ role: "user", content: extraUserContent });
    }
    return msgs;
  };

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
  const selectedContext = useLayer2
    ? buildSystemPrompt(buildFullContext(baseContext, {
        monthlySummary: ctx.summaryMap["monthly"] ?? null,
        quarterlySummary: ctx.summaryMap["quarterly"] ?? null,
        biannualSummary: ctx.summaryMap["biannual"] ?? null,
        docsSummary: ctx.docsSummary,
      }))
    : buildSystemPrompt(baseContext);
  const selectedMaxTokens = useLayer2 ? 2048 : 1024;

  try {
    let currentMessages = buildMessages(userContentBlocks);
    let maxTurns = 2;

    const llmStart = Date.now();
    while (maxTurns-- > 0) {
      const resp = await callAnthropic({
        model: selectedModel,
        system: selectedContext,
        messages: currentMessages,
        tools: [LOG_SYMPTOM_TOOL],
        max_tokens: selectedMaxTokens,
        ...(useLayer2 ? { temperature: 0 } : {}),
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
          if (tb.name !== "log_symptom") {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tb.id,
              content: "Unknown tool.",
            });
            continue;
          }

          const input = tb.input as {
            content?: string;
            keywords?: string[];
            severity?: string;
            time_of_day?: string;
          };
          const summary =
            typeof input.content === "string" && input.content.trim()
              ? input.content.trim()
              : null;

          if (summary) {
            const rawKeywords = Array.isArray(input.keywords)
              ? input.keywords.filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim())
              : [];
            const keywords = rawKeywords.length > 0 ? normalizeKeywords(rawKeywords) : [];
            const severity =
              input.severity === "low" || input.severity === "medium" || input.severity === "high" || input.severity === "positive"
                ? input.severity
                : null;
            const meta: Record<string, unknown> = {};
            if (keywords.length > 0) meta.symptom_keywords = keywords;

            const tod = typeof input.time_of_day === "string" ? input.time_of_day : "now";
            let createdAt: string | undefined;
            if (tod !== "now" && tod in TIME_OF_DAY_HOURS) {
              const hour = TIME_OF_DAY_HOURS[tod];
              createdAt = `${dateStr}T${String(hour).padStart(2, "0")}:00:00+08:00`;
              if (input.time_of_day) meta.time_of_day = input.time_of_day;
            }

            const insertPayload: Record<string, unknown> = {
              user_id: userId,
              local_date: dateStr,
              summary,
              tags: keywords,
              severity,
              source_message_id: sourceMessageId,
              meta,
            };
            if (createdAt) insertPayload.created_at = createdAt;

            const { error: logErr } = await supabaseAdmin
              .from("symptom_summaries")
              .insert(insertPayload);
            if (!logErr) dailyLogUpdated = true;
            else console.error("symptom_summaries insert:", logErr);
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: tb.id,
            content: summary ? "已成功记录。" : "参数无效，未记录。",
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
