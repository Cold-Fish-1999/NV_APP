/**
 * Health summary AI: model + length limits per summary kind.
 * Scheduled jobs: weekly/monthly use gpt-4o; quarterly/biannual use gpt-4o-mini.
 * Backfill: all calls use gpt-4o-mini (same length hints as the matching level).
 *
 * Length hints are tight word caps; `SUMMARY_STYLE_RULES` pushes information density.
 */

export const SUMMARY_MODELS = {
  weekly_snapshot: "gpt-4o",
  rolling_weekly: "gpt-4o",
  monthly: "gpt-4o",
  quarterly: "gpt-4o-mini",
  biannual: "gpt-4o-mini",
  backfill_weekly: "gpt-4o-mini",
  backfill_monthly: "gpt-4o-mini",
  backfill_rolling: "gpt-4o-mini",
  backfill_quarterly: "gpt-4o-mini",
  backfill_biannual: "gpt-4o-mini",
} as const;

export type SummaryKind = keyof typeof SUMMARY_MODELS;

/** Appended to every summary system prompt after the word-limit hint. */
export const SUMMARY_STYLE_RULES =
  "Prioritize information density. Cover: (1) time anchor, (2) notable behaviors/supplements/activities, (3) symptom status (positive or negative trends), (4) overall pattern. Avoid restating the same point in different words. Do not use filler openers or closers such as \"Overall\", \"In summary\", or \"In conclusion\".";

export const SUMMARY_LENGTH: Record<
  SummaryKind,
  { prompt: string; max_tokens: number }
> = {
  weekly_snapshot: { prompt: "in under 50 words", max_tokens: 95 },
  rolling_weekly: { prompt: "in under 80 words", max_tokens: 130 },
  monthly: { prompt: "in under 100 words", max_tokens: 165 },
  quarterly: { prompt: "in under 150 words", max_tokens: 250 },
  biannual: { prompt: "in under 200 words", max_tokens: 330 },
  backfill_weekly: { prompt: "in under 50 words", max_tokens: 95 },
  backfill_monthly: { prompt: "in under 100 words", max_tokens: 165 },
  backfill_rolling: { prompt: "in under 80 words", max_tokens: 130 },
  backfill_quarterly: { prompt: "in under 150 words", max_tokens: 250 },
  backfill_biannual: { prompt: "in under 200 words", max_tokens: 330 },
};

export async function chatHealthSummary(
  kind: SummaryKind,
  baseSystemPrompt: string,
  userContent: string,
  openaiApiKey: string
): Promise<string> {
  const model = SUMMARY_MODELS[kind];
  const { prompt: lengthHint, max_tokens } = SUMMARY_LENGTH[kind];
  const systemPrompt = `${baseSystemPrompt.trim()} ${lengthHint}. ${SUMMARY_STYLE_RULES}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
