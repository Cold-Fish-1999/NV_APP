/**
 * API 基地址
 * - 模拟器/Web: http://localhost:3000
 * - 真机: 设置 EXPO_PUBLIC_API_URL，如 http://10.0.0.166:3000
 */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

import { Platform } from "react-native";
import { toLocalDateStr } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";

function getApiBasesForDev(): string[] {
  const bases = [API_BASE];
  if (__DEV__ && Platform.OS === "ios" && API_BASE !== "http://localhost:3000") {
    bases.push("http://localhost:3000");
  }
  return bases;
}

async function fetchWithApiBaseFallback(
  path: string,
  init: RequestInit,
  timeoutMs = 120_000,
  externalSignal?: AbortSignal | null,
): Promise<Response> {
  const bases = getApiBasesForDev();
  let lastError: unknown;
  for (const base of bases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (externalSignal) {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

export type ChatContextMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  meta?: {
    imagePaths?: Array<{ bucket: string; path: string }>;
    deepAnalysis?: boolean;
  };
};

/** 拉取最近 24h 对话历史（不含 system） */
export async function fetchChatMessages(
  _localDate?: string,
  sinceIso?: string
): Promise<ChatMessageRow[]> {
  const since = sinceIso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const query = supabase
    .from("chat_messages")
    .select("id, role, content, created_at, meta")
    .neq("role", "system")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function sendChatMessage(
  message: string,
  accessToken?: string | null,
  imageUrls?: string[],
  imagePaths?: Array<{ bucket: string; path: string }>,
  mockTier?: "free" | "prime" | "pro" | null,
  signal?: AbortSignal | null,
): Promise<{ reply: string; deepAnalysis: boolean }> {
  let token = accessToken;
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
  if (!token) {
    throw new Error("Not signed in. Please complete authentication.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (mockTier) headers["x-nvapp-mock-tier"] = mockTier;

  const localDate = toLocalDateStr();

  const body: Record<string, unknown> = { message, localDate };
  if (Array.isArray(imageUrls) && imageUrls.length > 0) body.imageUrls = imageUrls;
  if (Array.isArray(imagePaths) && imagePaths.length > 0) body.imagePaths = imagePaths;
  const res = await fetchWithApiBaseFallback("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, 120_000, signal);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error ?? `API error: ${res.status}`;
    throw new Error(msg);
  }
  return { reply: data.reply ?? "", deepAnalysis: data.deepAnalysis === true };
}

export async function transcribeAudio(
  audioUri: string,
  accessToken?: string | null
): Promise<{ text: string }> {
  let token = accessToken;
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
  if (!token) {
    throw new Error("Not signed in. Please complete authentication.");
  }

  const fileName = audioUri.split("/").pop() ?? "recording.m4a";
  const mimeType = fileName.endsWith(".wav") ? "audio/wav" : "audio/m4a";

  const formData = new FormData();
  if (Platform.OS === "web") {
    // Web 端不能使用 React Native 的 { uri, type, name } 方式，需要真实 Blob/File
    const audioRes = await fetch(audioUri);
    const blob = await audioRes.blob();
    formData.append("file", blob, fileName);
  } else {
    formData.append(
      "file",
      {
        uri: audioUri,
        type: mimeType,
        name: fileName,
      } as unknown as Blob
    );
  }
  formData.append("model", "gpt-4o-mini-transcribe");

  const res = await fetchWithApiBaseFallback("/api/transcribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error ?? `API error: ${res.status}`;
    throw new Error(msg);
  }
  return { text: String(data.text ?? "") };
}

/** 删除资料记录后：防抖入队 `document_context` 全文重建（不阻塞、不直接调用 OpenAI）。 */
export async function scheduleDocumentContextRefreshAfterDelete(
  accessToken?: string | null
): Promise<void> {
  let token = accessToken;
  if (!token) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
  if (!token) return;

  await fetchWithApiBaseFallback("/api/document-context-schedule-refresh", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => undefined);
}

export async function analyzeProfileDocumentUploads(
  uploadIds: string[],
  accessToken?: string | null,
  userRemark?: string | null
): Promise<{
  combinedSummary: string;
  itemSummaries: Array<{ uploadId: string; summary: string; extractedText: string }>;
}> {
  if (uploadIds.length === 0) {
    return { combinedSummary: "", itemSummaries: [] };
  }
  let token = accessToken;
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
  if (!token) {
    throw new Error("Not signed in. Please complete authentication.");
  }

  const body: { uploadIds: string[]; userRemark?: string } = { uploadIds };
  const remark = typeof userRemark === "string" ? userRemark.trim() : "";
  if (remark) body.userRemark = remark;

  const res = await fetchWithApiBaseFallback("/api/profile-document-analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error ?? `API error: ${res.status}`;
    throw new Error(msg);
  }
  return {
    combinedSummary: String(data.combinedSummary ?? ""),
    itemSummaries: Array.isArray(data.itemSummaries)
      ? data.itemSummaries.map((x: Record<string, unknown>) => ({
          uploadId: String(x.uploadId ?? ""),
          summary: String(x.summary ?? ""),
          extractedText: String(x.extractedText ?? ""),
        }))
      : [],
  };
}

/**
 * Pro：从单条健康记录正文抽取 keywords + severity（服务端专用路由，无聊天上下文/tools）。
 */
export async function generateSymptomMeta(
  description: string,
  accessToken?: string | null,
  options?: { category?: "symptom_feeling" | "medication_supplement" },
): Promise<{ keywords: string[]; severity: string }> {
  let token = accessToken;
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
  if (!token) return { keywords: [], severity: "medium" };

  const category = options?.category;
  try {
    const res = await fetchWithApiBaseFallback("/api/health-record-meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        description: description.trim(),
        ...(category ? { category } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { keywords: [], severity: "medium" };
    const keywords = Array.isArray(data.keywords)
      ? data.keywords.map(String).slice(0, 5)
      : [];
    const sev = typeof data.severity === "string" ? data.severity : "medium";
    const severity = ["low", "medium", "high", "positive"].includes(sev) ? sev : "medium";
    return { keywords, severity };
  } catch {
    return { keywords: [], severity: "medium" };
  }
}

export type AiUsageEventDetail = {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  feature: string;
  source: string;
  inputTokens: number;
  outputTokens: number;
  metadata: Record<string, unknown> | null;
};

export type AiUsageSummary = {
  since: string;
  days: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: {
    openai: { inputTokens: number; outputTokens: number; calls: number };
    anthropic: { inputTokens: number; outputTokens: number; calls: number };
  };
  byFeature: Record<string, { inputTokens: number; outputTokens: number; calls: number }>;
  events?: AiUsageEventDetail[];
  eventLimit?: number;
};

/** Profile Test UI：聚合 ai_usage_events（需已部署迁移且各路由已接入 recordAiUsage） */
export async function fetchAiUsageSummary(
  accessToken?: string | null,
  days = 30,
  options?: { includeEventDetails?: boolean; eventLimit?: number },
): Promise<AiUsageSummary | null> {
  let token = accessToken;
  if (!token) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
  if (!token) return null;

  const include = options?.includeEventDetails === true;
  const evLimit = options?.eventLimit ?? 150;
  const q = new URLSearchParams();
  q.set("days", String(days));
  if (include) {
    q.set("details", "1");
    q.set("eventLimit", String(evLimit));
  }

  try {
    const res = await fetchWithApiBaseFallback(
      `/api/ai-usage-summary?${q.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      30_000,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[fetchAiUsageSummary]", res.status, data?.error);
      return null;
    }
    return data as AiUsageSummary;
  } catch (e) {
    console.warn("[fetchAiUsageSummary]", e);
    return null;
  }
}
