/**
 * DB-backed, self-evolving keyword normalization (Node.js version).
 *
 * Same logic as supabase/functions/_shared/normalizeKeywords.ts but for Node.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { detectLang, type Lang } from "./symptomTaxonomy";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

interface LoadedTaxonomy {
  byVariant: Map<string, string>;
  standardsByLang: Map<string, Map<string, string>>;
}

async function loadTaxonomy(supabase: SupabaseClient): Promise<LoadedTaxonomy> {
  const { data, error } = await supabase
    .from("taxonomy_variants")
    .select("variant, lang, standard_id, taxonomy_standards!inner(key)")
    .limit(5000);

  if (error) {
    console.error("[taxonomy] Failed to load:", error.message);
    return { byVariant: new Map(), standardsByLang: new Map() };
  }

  const byVariant = new Map<string, string>();
  const standardsByLang = new Map<string, Map<string, string>>();

  for (const row of data ?? []) {
    const std = (row as any).taxonomy_standards;
    const key = `${row.lang}:${row.variant.toLowerCase()}`;
    byVariant.set(key, std.key);

    if (!standardsByLang.has(row.lang)) standardsByLang.set(row.lang, new Map());
    standardsByLang.get(row.lang)!.set(std.key, row.standard_id);
  }

  return { byVariant, standardsByLang };
}

function matchLocal(taxonomy: LoadedTaxonomy, keyword: string): string | null {
  const lang = detectLang(keyword);
  const key = `${lang}:${keyword.toLowerCase().trim()}`;
  return taxonomy.byVariant.get(key) ?? null;
}

interface AiExpansionResult {
  map_to_existing: Record<string, string>;
  new_variants_for_existing: Record<string, string[]>;
  new_clusters: Array<{ standard: string; variants: string[] }>;
  unmapped: string[];
}

async function callAiExpand(
  unmatched: string[],
  lang: Lang,
  existingStandards: string[],
  anthropicApiKey: string,
): Promise<AiExpansionResult | null> {
  const langLabel = { zh: "Chinese", en: "English", es: "Spanish" }[lang];

  const prompt = `You are a medical terminology expert. Analyze unmatched symptom keywords and integrate them into an existing taxonomy.

Language: ${langLabel} — ALL output MUST stay in ${langLabel}. NEVER translate.

## Existing standard keys (${lang}):
${JSON.stringify(existingStandards)}

## Unmatched keywords to process:
${JSON.stringify(unmatched)}

Do TWO things:

1. **Map to existing**: For each keyword that is a synonym/variant of an existing standard key, map it.
   Example: "肚子不舒服" → "胃痛" (existing), "tired" → "fatigue" (existing)

2. **Cluster new**: Keywords that don't match ANY existing standard but are similar to EACH OTHER — group them into a new standard key. The new standard key should be a concise, canonical medical term.
   Only create a new cluster if 2+ keywords clearly belong together OR a single keyword is a clear distinct symptom not covered by existing standards.

Return ONLY valid JSON with this exact structure:
{
  "map_to_existing": {"unmatched_keyword": "existing_standard_key", ...},
  "new_variants_for_existing": {"existing_standard_key": ["variant1", "variant2"], ...},
  "new_clusters": [{"standard": "new_standard_key", "variants": ["kw1", "kw2"]}],
  "unmapped": ["keywords_that_dont_fit_anywhere"]
}

Rules:
- ONLY map a keyword to an existing standard if it is a clear synonym or direct variant.
  "stomach discomfort" → "stomach_pain" ✅ (direct synonym)
  "pain" → "muscle_pain" ❌ (too vague, "pain" alone is not specifically muscle pain — put in unmapped)
  "digestive issue" → "bloating" ❌ (digestive issue is broader than bloating — put in unmapped or create new)
  "消化问题" → "身体不适" ❌ (too vague a mapping — keep original or create new)
- When in doubt, put the keyword in "unmapped" to preserve the original. Do NOT force-fit.
- map_to_existing values MUST be from the existing standards list
- new_clusters standard keys MUST NOT duplicate existing standards
- Every input keyword must appear in exactly one of: map_to_existing, new_clusters.variants, or unmapped
- Keep standard keys short (1-3 words)`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 2048,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn("[taxonomy-ai] API error:", res.status);
      return null;
    }

    const data = await res.json();
    const text = data.content?.find((b: any) => b.type === "text")?.text ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as AiExpansionResult;
  } catch (e) {
    console.warn("[taxonomy-ai] Failed:", e);
    return null;
  }
}

async function writeExpansion(
  supabase: SupabaseClient,
  lang: Lang,
  result: AiExpansionResult,
  standardsMap: Map<string, string>,
  requestId: string,
): Promise<{ applied: Record<string, string>; skipped: string[] }> {
  const applied: Record<string, string> = {};
  const skipped: string[] = [];

  for (const [variant, standardKey] of Object.entries(result.map_to_existing)) {
    const stdId = standardsMap.get(standardKey);
    if (!stdId) {
      skipped.push(`${variant}: standard "${standardKey}" not found`);
      continue;
    }

    const { error } = await supabase
      .from("taxonomy_variants")
      .insert({
        standard_id: stdId,
        variant,
        lang,
        source: "ai",
        created_by: requestId,
      })
      .select("id")
      .maybeSingle();

    if (error?.code === "23505") {
      skipped.push(`${variant}: already exists`);
    } else if (error) {
      skipped.push(`${variant}: ${error.message}`);
    } else {
      applied[variant] = standardKey;
    }
  }

  for (const cluster of result.new_clusters ?? []) {
    const { data: stdRow, error: stdErr } = await supabase
      .from("taxonomy_standards")
      .insert({ lang, key: cluster.standard })
      .select("id")
      .maybeSingle();

    if (stdErr?.code === "23505") {
      skipped.push(`new standard "${cluster.standard}": already exists`);
      continue;
    }
    if (stdErr || !stdRow) {
      skipped.push(`new standard "${cluster.standard}": ${stdErr?.message}`);
      continue;
    }

    const allVariants = [...new Set([cluster.standard, ...cluster.variants])];
    for (const v of allVariants) {
      const { error: vErr } = await supabase
        .from("taxonomy_variants")
        .insert({
          standard_id: stdRow.id,
          variant: v,
          lang,
          source: "ai",
          created_by: requestId,
        })
        .select("id")
        .maybeSingle();

      if (vErr?.code === "23505") {
        skipped.push(`variant "${v}": already exists`);
      } else if (vErr) {
        skipped.push(`variant "${v}": ${vErr.message}`);
      } else {
        applied[v] = cluster.standard;
      }
    }
  }

  return { applied, skipped };
}

export async function normalizeKeywordsFromDb(
  rawKeywords: string[],
  anthropicApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Record<string, string>> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  let taxonomy = await loadTaxonomy(supabase);
  const mapping: Record<string, string> = {};
  const unmatched: string[] = [];

  for (const raw of rawKeywords) {
    const matched = matchLocal(taxonomy, raw);
    if (matched) {
      mapping[raw] = matched;
    } else {
      unmatched.push(raw);
    }
  }

  if (unmatched.length === 0) return mapping;

  const unique = [...new Set(unmatched)];
  const stillUnmatched: string[] = [];

  for (const kw of unique) {
    const { data } = await supabase
      .from("taxonomy_variants")
      .select("variant, taxonomy_standards!inner(key)")
      .eq("lang", detectLang(kw))
      .eq("variant", kw)
      .maybeSingle();

    if (data) {
      mapping[kw] = (data as any).taxonomy_standards.key;
    } else {
      stillUnmatched.push(kw);
    }
  }

  if (stillUnmatched.length === 0 || !anthropicApiKey) {
    for (const kw of stillUnmatched) mapping[kw] = kw;
    return mapping;
  }

  const byLang = new Map<Lang, string[]>();
  for (const kw of stillUnmatched) {
    const lang = detectLang(kw);
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(kw);
  }

  for (const [lang, keywords] of byLang) {
    const standards = taxonomy.standardsByLang.get(lang);
    const existingKeys = standards ? [...standards.keys()] : [];

    const aiResult = await callAiExpand(keywords, lang, existingKeys, anthropicApiKey);
    if (!aiResult) {
      for (const kw of keywords) mapping[kw] = kw;
      continue;
    }

    const standardsMap = standards ?? new Map<string, string>();
    const { applied, skipped } = await writeExpansion(
      supabase, lang, aiResult, standardsMap, requestId,
    );

    await supabase.from("taxonomy_ai_logs").insert({
      lang,
      input_keywords: keywords,
      ai_response: aiResult as unknown as Record<string, unknown>,
      applied,
      skipped,
      request_id: requestId,
    });

    console.info(
      `[taxonomy-ai] ${lang}: ${keywords.length} input → ${Object.keys(applied).length} applied, ${skipped.length} skipped`,
    );
  }

  taxonomy = await loadTaxonomy(supabase);

  for (const kw of stillUnmatched) {
    if (mapping[kw]) continue;
    const matched = matchLocal(taxonomy, kw);
    mapping[kw] = matched ?? kw;
  }

  return mapping;
}
