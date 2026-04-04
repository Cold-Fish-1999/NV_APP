import { z } from "zod";

/** 单时段结构：清晨/上午/中午/晚上/深夜 */
export const timeSlotSchema = z.object({
  symptoms: z.array(z.string()).default([]),
  feelings: z.array(z.string()).default([]),
  behaviors: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export type TimeSlot = z.infer<typeof timeSlotSchema>;

export const timeSlotKeys = [
  "earlyMorning",
  "morning",
  "noon",
  "evening",
  "lateNight",
] as const;

export type TimeSlotKey = (typeof timeSlotKeys)[number];

/** 五个时间段的 structuredContent */
export const structuredContentSchema = z.object({
  earlyMorning: timeSlotSchema,
  morning: timeSlotSchema,
  noon: timeSlotSchema,
  evening: timeSlotSchema,
  lateNight: timeSlotSchema,
});

export type StructuredContent = z.infer<typeof structuredContentSchema>;

/** DailyLog 完整 schema */
export const dailyLogSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  rawInput: z.string(),
  structuredContent: structuredContentSchema,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type DailyLog = z.infer<typeof dailyLogSchema>;

/** 创建 DailyLog 时不需要 id/createdAt/updatedAt */
export const createDailyLogSchema = dailyLogSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateDailyLog = z.infer<typeof createDailyLogSchema>;
