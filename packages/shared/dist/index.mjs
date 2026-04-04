// src/daily-log.ts
import { z } from "zod";
var timeSlotSchema = z.object({
  symptoms: z.array(z.string()).default([]),
  feelings: z.array(z.string()).default([]),
  behaviors: z.array(z.string()).default([]),
  notes: z.string().default("")
});
var timeSlotKeys = [
  "earlyMorning",
  "morning",
  "noon",
  "evening",
  "lateNight"
];
var structuredContentSchema = z.object({
  earlyMorning: timeSlotSchema,
  morning: timeSlotSchema,
  noon: timeSlotSchema,
  evening: timeSlotSchema,
  lateNight: timeSlotSchema
});
var dailyLogSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  rawInput: z.string(),
  structuredContent: structuredContentSchema,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
var createDailyLogSchema = dailyLogSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export {
  createDailyLogSchema,
  dailyLogSchema,
  structuredContentSchema,
  timeSlotKeys,
  timeSlotSchema
};
