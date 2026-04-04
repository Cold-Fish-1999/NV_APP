/**
 * Keyword normalization pipeline for report generation.
 * Step 1: local taxonomy (zero cost)
 * Step 2: unmatched → Claude Haiku (AI fallback)
 * Step 3: merge into final mapping
 */
import {
  normalizeKeyword,
  ZH_TAXONOMY,
  EN_TAXONOMY,
  ES_TAXONOMY,
} from "./symptomTaxonomy.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function getAllStandardWords(): string[] {
  const words: string[] = [];
  for (const key of Object.keys(ZH_TAXONOMY)) words.push(key);
  for (const key of Object.keys(EN_TAXONOMY)) words.push(key);
  for (const key of Object.keys(ES_TAXONOMY)) words.push(key);
  return [...new Set(words)];
}

export async function normalizeKeywordsBatch(
  rawKeywords: string[],
  anthropicApiKey: string
): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  const unmatched: string[] = [];

  for (const raw of rawKeywords) {
    const normalized = normalizeKeyword(raw);
    mapping[raw] = normalized;
    if (normalized === raw.trim()) {
      unmatched.push(raw);
    }
  }

  if (unmatched.length === 0 || !anthropicApiKey) return mapping;

  const unique = [...new Set(unmatched)];
  const standardWords = getAllStandardWords();

  try {
    const prompt = `Normalize each symptom keyword to a clean standard medical term. I also provide a reference word table.
Rules:
- Keep the SAME language as the input (Chinese→Chinese, English→English, Spanish→Spanish)
- Group synonyms to the same standard term, keep it short (1–3 words) (if could, if not just keep the original synonyms)
- Return ONLY valid JSON, no explanation: {"original": "standard", ...}

Reference standard words: ${JSON.stringify(standardWords.slice(0, 100))}

Input: ${JSON.stringify(unique)}`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn("[normalizeKeywords] Haiku API error:", res.status);
      return mapping;
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text =
      data.content?.find((b) => b.type === "text")?.text ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const aiMap = JSON.parse(cleaned) as Record<string, string>;

    for (const [orig, std] of Object.entries(aiMap)) {
      if (typeof std === "string" && std.trim()) {
        mapping[orig] = std.trim();
      }
    }
  } catch (e) {
    console.warn("[normalizeKeywords] AI fallback failed:", e);
  }

  return mapping;
}

export function applyMapping(
  tags: string[],
  mapping: Record<string, string>
): string[] {
  const normalized = tags.map((t) => mapping[t] ?? t);
  return [...new Set(normalized)];
}
