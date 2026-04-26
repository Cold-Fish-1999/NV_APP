/**
 * Document context (user_document_context) — Deno Edge entry: refreshDocumentContext(admin, userId).
 * Mirrors apps/server/lib/documentContext.ts; keep in sync when changing prompts or filters.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const DOC_READY_STATUSES = ["ready", "completed"] as const;

/** OpenAI 文本聚合（与 apps/server/lib/documentContext.ts 对齐） */
const DOCUMENT_CONTEXT_TEXT_MODEL = "gpt-4o";

function parseAiJson(raw: string): { docs_summary?: string | null; risk_flags?: string[] } {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { docs_summary?: unknown; risk_flags?: unknown };
    const docs_summary =
      typeof parsed.docs_summary === "string"
        ? parsed.docs_summary
        : parsed.docs_summary === null
          ? null
          : undefined;
    const risk_flags = Array.isArray(parsed.risk_flags)
      ? parsed.risk_flags.filter((x): x is string => typeof x === "string")
      : [];
    return { docs_summary: docs_summary ?? undefined, risk_flags };
  } catch {
    return { docs_summary: null, risk_flags: [] };
  }
}

export async function refreshDocumentContext(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<void> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY not set");

  const { data: docs } = await supabaseAdmin
    .from("profile_document_uploads")
    .select("id, category, ai_summary, created_at")
    .eq("user_id", userId)
    .in("status", [...DOC_READY_STATUSES])
    .not("ai_summary", "is", null)
    .order("created_at", { ascending: true });

  if (!docs || docs.length === 0) {
    const { error } = await supabaseAdmin.from("user_document_context").upsert(
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
    category: d.category as string,
    summary: d.ai_summary as string,
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
${docsItems.map((d, i) => `[${i + 1}] Category: ${d.category}\n${d.summary}`).join("\n\n")}
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

  const { error: upErr } = await supabaseAdmin.from("user_document_context").upsert(
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
