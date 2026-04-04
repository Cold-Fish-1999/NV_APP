/**
 * 向 symptom_summaries 插入 mock 数据
 * 用法: cd apps/server && npx tsx scripts/seed-symptom-mock.ts
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_ID = "fbb0f3f7-95fe-4c69-9caa-f85597faa64b";

const KEYWORDS_POOL = [
  "头痛",
  "乏力",
  "失眠",
  "腹泻",
  "咳嗽",
  "感冒",
  "发热",
  "胃痛",
  "头晕",
  "恶心",
  "疲劳",
  "焦虑",
  "背痛",
  "眼睛干涩",
  "口干",
  "鼻塞",
  "食欲不振",
  "心悸",
  "肌肉酸痛",
  "喉咙痛",
];

const SUMMARIES = [
  "早上起来有点头痛，可能是没睡好",
  "感觉比较累，下午想休息",
  "昨晚睡得不太好，有点失眠",
  "肚子不太舒服，有点腹泻",
  "喉咙有点痒，偶尔咳嗽",
  "可能着凉了，有点感冒症状",
  "体温略高，有点发热",
  "胃部隐隐作痛",
  "站起来有点头晕",
  "有点恶心，不想吃东西",
  "整体比较疲劳",
  "心情有点焦虑",
  "后背酸痛，可能是坐久了",
  "眼睛干涩，盯屏幕太久",
  "口干舌燥，多喝点水",
  "鼻子有点堵",
  "没什么胃口",
  "心跳有点快",
  "全身肌肉酸痛",
  "喉咙痛，吞咽不舒服",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function main() {
  const rows: {
    user_id: string;
    local_date: string;
    created_at: string;
    summary: string;
    tags: string[];
    meta: { symptom_keywords: string[] };
  }[] = [];

  const today = new Date();
  for (let d = 0; d < 14; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const localDate = date.toISOString().slice(0, 10);

    // 每天 3-6 条记录，分布在不同时段
    const slots = [
      { h: 7, m: 15 }, // morning
      { h: 10, m: 30 }, // morning
      { h: 14, m: 45 }, // afternoon
      { h: 19, m: 20 }, // evening
      { h: 23, m: 5 }, // night
    ];
    const count = 3 + Math.floor(Math.random() * 4); // 3-6 条
    const usedSlots = pickRandomN(slots, count);

    for (const slot of usedSlots) {
      const created = new Date(date);
      created.setHours(slot.h, slot.m, 0, 0);
      const keywords = pickRandomN(KEYWORDS_POOL, 1 + Math.floor(Math.random() * 3));
      rows.push({
        user_id: USER_ID,
        local_date: localDate,
        created_at: created.toISOString(),
        summary: pickRandom(SUMMARIES),
        tags: keywords,
        meta: { symptom_keywords: keywords },
      });
    }
  }

  const { data, error } = await supabase.from("symptom_summaries").insert(rows).select("id");

  if (error) {
    console.error("插入失败:", error);
    process.exit(1);
  }

  console.log(`成功插入 ${data?.length ?? rows.length} 条 mock 数据`);
}

main();
