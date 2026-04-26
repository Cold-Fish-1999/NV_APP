/**
 * Document context aggregation (user_document_context).
 * Entry points: refreshDocumentContext, incrementalRefreshDocumentContext, scheduleFullRefreshDocumentContext.
 */
import { supabaseAdmin } from "@/lib/supabase";
import { docCategoryLabel } from "@/lib/docCategory";
import type { SupabaseClient } from "@supabase/supabase-js";

const DOC_READY_STATUSES = ["ready", "completed"] as const;

/** OpenAI 文本聚合 / 摘要更新（与 profile 资料分析对齐） */
const DOCUMENT_CONTEXT_TEXT_MODEL = "gpt-4o";

function parseAiJson(raw: string): { docs_summary?: string | null; risk_flags?: string[] } {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { docs_summary?: unknown; risk_flags?: unknown };
    const docs_summary =
      typeof parsed.docs_summary === "string" ? parsed.docs_summary : parsed.docs_summary === null ? null : undefined;
    const risk_flags = Array.isArray(parsed.risk_flags)
      ? parsed.risk_flags.filter((x): x is string => typeof x === "string")
      : [];
    return { docs_summary: docs_summary ?? undefined, risk_flags };
  } catch {
    return { docs_summary: null, risk_flags: [] };
  }
}

export type NewDocPayload = {
  id: string;
  category: string;
  ai_summary: string;
  created_at: string;
};

type DocItem = {
  document_id: string;
  category: string;
  summary: string;
  uploaded_at: string;
};

async function refreshDocumentContextWithClient(
  admin: SupabaseClient,
  openaiApiKey: string,
  userId: string
): Promise<void> {
  const { data: docs } = await admin
    .from("profile_document_uploads")
    .select("id, category, ai_summary, created_at, report_date")
    .eq("user_id", userId)
    .in("status", [...DOC_READY_STATUSES])
    .not("ai_summary", "is", null)
    .order("created_at", { ascending: true });

  if (!docs || docs.length === 0) {
    const { error } = await admin.from("user_document_context").upsert(
      {
        user_id: userId,
        docs_summary: null,
        docs_items: [],
        risk_flags: [],
        generated_by_model: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
    return;
  }

  const docsItems = docs.map((d) => ({
    document_id: d.id as string,
    category: docCategoryLabel(d.category as string),
    summary: d.ai_summary as string,
    report_date: (d as any).report_date as string | null,
    uploaded_at: d.created_at as string,
  }));

  const model = DOCUMENT_CONTEXT_TEXT_MODEL;

  const prompt = `
You are a medical document analyst. Below are AI-generated summaries of a user's health documents.

Your tasks:
1. Write a cohesive narrative paragraph summarizing the user's overall health picture. Keep it under 200 words.
2. Extract a list of risk signals or notable health flags as short phrases (e.g. "family history of diabetes").

Respond ONLY with valid JSON, no preamble, no markdown:
{"docs_summary": "...", "risk_flags": ["...", "..."]}

Documents:
${docsItems.map((d, i) => `[${i + 1}] Category: ${d.category}${d.report_date ? ` | Report date: ${d.report_date}` : ""}\n${d.summary}`).join("\n\n")}
  `.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = result.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseAiJson(text);

  const { error: upErr } = await admin.from("user_document_context").upsert(
    {
      user_id: userId,
      docs_summary: parsed.docs_summary ?? null,
      docs_items: docsItems,
      risk_flags: parsed.risk_flags ?? [],
      generated_by_model: model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (upErr) throw upErr;
}

async function incrementalRefreshDocumentContextWithClient(
  admin: SupabaseClient,
  openaiApiKey: string,
  userId: string,
  newDoc: NewDocPayload
): Promise<void> {
  const { data: existing, error: exErr } = await admin
    .from("user_document_context")
    .select("docs_summary, docs_items, risk_flags")
    .eq("user_id", userId)
    .maybeSingle();

  if (exErr) throw exErr;

  if (!String(existing?.docs_summary ?? "").trim()) {
    await refreshDocumentContextWithClient(admin, openaiApiKey, userId);
    return;
  }

  const existingItems = (existing.docs_items as DocItem[] | null) ?? [];
  const newItem: DocItem = {
    document_id: newDoc.id,
    category: docCategoryLabel(newDoc.category),
    summary: newDoc.ai_summary,
    uploaded_at: newDoc.created_at,
  };
  const updatedItems: DocItem[] = [...existingItems, newItem];

  const prompt = `
You are a medical document analyst maintaining a running health summary.

Existing summary:
${existing.docs_summary}

Existing risk flags:
${(existing.risk_flags ?? []).join(", ") || "none"}

A new health document has been added:
Category: ${newDoc.category}
Summary: ${newDoc.ai_summary}

Update the summary to incorporate this new document. Keep it under 200 words.
Update the risk flags only if the new document introduces new risks.
Keep existing flags unless directly contradicted.

Respond ONLY with valid JSON, no preamble, no markdown:
{"docs_summary": "...", "risk_flags": ["...", "..."]}
  `.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: DOCUMENT_CONTEXT_TEXT_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = result.choices?.[0]?.message?.content ?? "{}";
  const parsed = parseAiJson(text);

  const { error: upErr } = await admin.from("user_document_context").upsert(
    {
      user_id: userId,
      docs_summary: parsed.docs_summary ?? (existing.docs_summary as string),
      docs_items: updatedItems,
      risk_flags: parsed.risk_flags ?? (existing.risk_flags as string[]) ?? [],
      generated_by_model: DOCUMENT_CONTEXT_TEXT_MODEL,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (upErr) throw upErr;
}

async function scheduleFullRefreshDocumentContextWithClient(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const DEBOUNCE_MINUTES = 10;

  const { data: existing, error: exErr } = await admin
    .from("summary_generation_queue")
    .select("id")
    .eq("user_id", userId)
    .eq("level", "document_context")
    .eq("status", "pending")
    .maybeSingle();

  if (exErr) throw exErr;

  const scheduledAt = new Date(Date.now() + DEBOUNCE_MINUTES * 60 * 1000).toISOString();

  if (existing?.id) {
    const { error } = await admin
      .from("summary_generation_queue")
      .update({ scheduled_at: scheduledAt })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("summary_generation_queue").insert({
      user_id: userId,
      level: "document_context",
      status: "pending",
      triggered_by: "document_deleted",
      scheduled_at: scheduledAt,
    });
    if (error) throw error;
  }
}

export async function refreshDocumentContext(userId: string): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  await refreshDocumentContextWithClient(supabaseAdmin, key, userId);
}

export async function incrementalRefreshDocumentContext(
  userId: string,
  newDoc: NewDocPayload
): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  await incrementalRefreshDocumentContextWithClient(supabaseAdmin, key, userId, newDoc);
}

export async function scheduleFullRefreshDocumentContext(userId: string): Promise<void> {
  await scheduleFullRefreshDocumentContextWithClient(supabaseAdmin, userId);
}

/**
 * Pro 升级后与 backfill 队列并列的「全文档案摘要」重建入口。
 * 数据库触发器会插入 `document_context` 队列任务，由 `process-document-queue` 调用 `refreshDocumentContext` 完成；
 * 若将来在服务端直接处理升级 webhook，可调用此函数。
 */
export async function onUserUpgraded(userId: string): Promise<void> {
  await refreshDocumentContext(userId);
}
