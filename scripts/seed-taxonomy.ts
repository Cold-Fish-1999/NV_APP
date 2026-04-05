/**
 * Seed taxonomy_standards + taxonomy_variants from hardcoded taxonomy.
 *
 * Usage:
 *   npx tsx scripts/seed-taxonomy.ts [--dry-run]
 *
 * Requires .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from "dotenv";
config({ path: "apps/server/.env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  ZH_TAXONOMY,
  EN_TAXONOMY,
  ES_TAXONOMY,
} from "../apps/server/lib/symptomTaxonomy";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const dryRun = process.argv.includes("--dry-run");

type Lang = "zh" | "en" | "es";

const TAXONOMIES: { lang: Lang; data: Record<string, string[]> }[] = [
  { lang: "zh", data: ZH_TAXONOMY },
  { lang: "en", data: EN_TAXONOMY },
  { lang: "es", data: ES_TAXONOMY },
];

async function main() {
  console.log(`=== Seed Taxonomy ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  let totalStandards = 0;
  let totalVariants = 0;

  for (const { lang, data } of TAXONOMIES) {
    const entries = Object.entries(data);
    console.log(`\n[${lang}] ${entries.length} standard keys`);

    for (const [standardKey, variants] of entries) {
      if (dryRun) {
        console.log(`  ${standardKey} → ${variants.length} variants`);
        totalStandards++;
        totalVariants += variants.length + 1;
        continue;
      }

      const { data: stdRow, error: stdErr } = await supabase
        .from("taxonomy_standards")
        .upsert({ lang, key: standardKey }, { onConflict: "lang,key" })
        .select("id")
        .single();

      if (stdErr) {
        console.error(`  ❌ Standard "${standardKey}":`, stdErr.message);
        continue;
      }
      totalStandards++;

      const allVariants = [...new Set([standardKey, ...variants])];
      const variantRows = allVariants.map((v) => ({
        standard_id: stdRow.id,
        variant: v,
        lang,
        source: "seed" as const,
        created_by: "seed-script",
      }));

      const { error: varErr } = await supabase
        .from("taxonomy_variants")
        .upsert(variantRows, { onConflict: "lang,variant", ignoreDuplicates: true });

      if (varErr) {
        console.error(`  ❌ Variants for "${standardKey}":`, varErr.message);
      } else {
        totalVariants += allVariants.length;
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Standards: ${totalStandards}`);
  console.log(`Variants: ${totalVariants}`);
}

main().catch(console.error);
