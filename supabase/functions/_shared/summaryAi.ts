/**
 * Health summary AI: model + length limits per summary kind.
 * Scheduled jobs: weekly/monthly use gpt-4o; quarterly/biannual use gpt-4o-mini.
 * Backfill: all calls use gpt-4o-mini (same length hints as the matching level).
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

export const SUMMARY_LENGTH: Record<
  SummaryKind,
  { prompt: string; max_tokens: number }
> = {
  weekly_snapshot: { prompt: "in under 100 words", max_tokens: 120 },
  rolling_weekly: { prompt: "in under 150 words", max_tokens: 220 },
  monthly: { prompt: "in under 150 words", max_tokens: 220 },
  quarterly: { prompt: "in under 200 words", max_tokens: 300 },
  biannual: { prompt: "in under 250 words", max_tokens: 380 },
  backfill_weekly: { prompt: "in under 100 words", max_tokens: 120 },
  backfill_monthly: { prompt: "in under 150 words", max_tokens: 220 },
  backfill_rolling: { prompt: "in under 150 words", max_tokens: 220 },
  backfill_quarterly: { prompt: "in under 200 words", max_tokens: 300 },
  backfill_biannual: { prompt: "in under 250 words", max_tokens: 380 },
};

export async function chatHealthSummary(
  kind: SummaryKind,
  baseSystemPrompt: string,
  userContent: string,
  openaiApiKey: string
): Promise<string> {
  const model = SUMMARY_MODELS[kind];
  const { prompt: lengthHint, max_tokens } = SUMMARY_LENGTH[kind];
  const systemPrompt = `${baseSystemPrompt.trim()} ${lengthHint}.`;

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
