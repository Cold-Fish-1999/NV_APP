"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createDailyLogSchema: () => createDailyLogSchema,
  dailyLogSchema: () => dailyLogSchema,
  structuredContentSchema: () => structuredContentSchema,
  timeSlotKeys: () => timeSlotKeys,
  timeSlotSchema: () => timeSlotSchema
});
module.exports = __toCommonJS(index_exports);

// src/daily-log.ts
var import_zod = require("zod");
var timeSlotSchema = import_zod.z.object({
  symptoms: import_zod.z.array(import_zod.z.string()).default([]),
  feelings: import_zod.z.array(import_zod.z.string()).default([]),
  behaviors: import_zod.z.array(import_zod.z.string()).default([]),
  notes: import_zod.z.string().default("")
});
var timeSlotKeys = [
  "earlyMorning",
  "morning",
  "noon",
  "evening",
  "lateNight"
];
var structuredContentSchema = import_zod.z.object({
  earlyMorning: timeSlotSchema,
  morning: timeSlotSchema,
  noon: timeSlotSchema,
  evening: timeSlotSchema,
  lateNight: timeSlotSchema
});
var dailyLogSchema = import_zod.z.object({
  id: import_zod.z.string().uuid().optional(),
  userId: import_zod.z.string().uuid(),
  date: import_zod.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  rawInput: import_zod.z.string(),
  structuredContent: structuredContentSchema,
  createdAt: import_zod.z.string().datetime().optional(),
  updatedAt: import_zod.z.string().datetime().optional()
});
var createDailyLogSchema = dailyLogSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDailyLogSchema,
  dailyLogSchema,
  structuredContentSchema,
  timeSlotKeys,
  timeSlotSchema
});
