import { supabaseAdmin } from "@/lib/supabase";

/** 与 docs/ai-token-metering-plan.md §3.1 对齐 */
export const AI_USAGE_FEATURES = {
  healthRecordMeta: "health_record_meta",
  transcribe: "transcribe",
  profileDocumentAnalyze: "profile_document_analyze",
  chat: "chat",
  documentContextFull: "document_context_full",
  documentContextIncremental: "document_context_incremental",
} as const;

export type AiUsageProvider = "anthropic" | "openai";

export type RecordAiUsageParams = {
  userId: string;
  feature: string;
  provider: AiUsageProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
  /** 默认 next_server；Edge 接入时传 edge */
  source?: string;
};

/**
 * 写入 ai_usage_events。失败仅打日志，不抛错，避免影响主业务。
 */
export async function recordAiUsage(params: RecordAiUsageParams): Promise<void> {
  const {
    userId,
    feature,
    provider,
    model,
    inputTokens,
    outputTokens,
    metadata,
    source = "next_server",
  } = params;

  try {
    const { error } = await supabaseAdmin.from("ai_usage_events").insert({
      user_id: userId,
      feature,
      provider,
      model,
      input_tokens: Math.max(0, Math.floor(inputTokens)),
      output_tokens: Math.max(0, Math.floor(outputTokens)),
      metadata: metadata ?? null,
      source,
    });

    if (error) {
      console.error("[aiUsage] insert failed:", error.message, { userId, feature, model });
    }
  } catch (e) {
    console.error("[aiUsage] insert exception:", (e as Error)?.message ?? e, {
      userId,
      feature,
      model,
    });
  }
}

/** Anthropic Messages API response.usage */
export function tokensFromAnthropicUsage(
  usage: { input_tokens?: number; output_tokens?: number } | null | undefined,
): { inputTokens: number; outputTokens: number } {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: Math.max(0, Math.floor(usage.input_tokens ?? 0)),
    outputTokens: Math.max(0, Math.floor(usage.output_tokens ?? 0)),
  };
}

/** OpenAI Chat Completions usage */
export function tokensFromOpenAIChatUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | null
    | undefined,
): { inputTokens: number; outputTokens: number } {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: Math.max(0, Math.floor(usage.prompt_tokens ?? 0)),
    outputTokens: Math.max(0, Math.floor(usage.completion_tokens ?? 0)),
  };
}

/**
 * OpenAI Audio Transcriptions 等：若响应无 token 字段，可将原始 usage 或秒数放入 metadata。
 * 此处仅做安全解析，不猜测 token。
 */
export function tokensFromOpenAIUsageLoose(
  usage: Record<string, unknown> | null | undefined,
): { inputTokens: number; outputTokens: number } {
  if (!usage || typeof usage !== "object") return { inputTokens: 0, outputTokens: 0 };
  const u = usage as {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  const inT = u.prompt_tokens ?? u.input_tokens;
  const outT = u.completion_tokens ?? u.output_tokens;
  if (inT == null && outT == null) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: Math.max(0, Math.floor(Number(inT ?? 0))),
    outputTokens: Math.max(0, Math.floor(Number(outT ?? 0))),
  };
}
