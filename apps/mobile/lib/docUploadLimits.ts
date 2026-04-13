import type { ProfileDocumentUpload } from "@/lib/profileService";

/** 与 migrations/026_profile_document_max_images.sql 保持一致（每批次仅图片时最多 6 张） */
export const MAX_IMAGES_PER_RECORD = 6;
/** 每批次仅文档时最多 1 个文件（与图片互斥） */
export const MAX_DOCUMENT_FILES_PER_RECORD = 1;
export const MAX_CONTEXTS_PER_USER = 10;
export const MAX_UPLOADS_PER_UTC_DAY = 10;
export const MAX_UPLOADS_PER_ROLLING_WEEK = 20;

/** 客户端上传前缩放，减轻存储与带宽（服务端 analyze 会再次缩小） */
export const CLIENT_UPLOAD_MAX_EDGE = 1600;

/** 聊天单条消息附件：最多图片数（与 apps/server/app/api/chat/route.ts 一致） */
export const MAX_CHAT_IMAGES_PER_MESSAGE = 5;

function utcDayStartMs(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function countUploadsOnSameUtcDayAs(rows: ProfileDocumentUpload[], refMs: number): number {
  const day = utcDayStartMs(refMs);
  return rows.filter((r) => utcDayStartMs(+new Date(r.created_at)) === day).length;
}

export function countUploadsInRollingUtcWeek(rows: ProfileDocumentUpload[], refMs: number): number {
  const cutoff = refMs - 7 * 24 * 60 * 60 * 1000;
  return rows.filter((r) => +new Date(r.created_at) >= cutoff).length;
}

export function countDistinctContexts(rows: ProfileDocumentUpload[]): number {
  const set = new Set<string>();
  for (const r of rows) {
    set.add(r.record_id || r.id);
  }
  return set.size;
}

export function mapProfileDocumentLimitError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("max_images_per_context")) {
    return "Max 6 images per document record.";
  }
  if (m.includes("max_contexts")) {
    return "You can have at most 10 document records (contexts). Delete one to add more.";
  }
  if (m.includes("max_uploads_per_utc_day")) {
    return "Daily upload limit reached (10 images per UTC day). Try again tomorrow.";
  }
  if (m.includes("max_uploads_per_7d")) {
    return "Weekly upload limit reached (20 images in the last 7 days).";
  }
  return message;
}
