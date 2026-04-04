/**
 * 免费用户限制常量与升级提示
 */
export const FREE_DAILY_MESSAGE_LIMIT = 3;
export const FREE_MAX_MESSAGE_LENGTH = 200;

export type UpgradeReason =
  | "upload_document"
  | "chat_image"
  | "daily_limit"
  | "message_length"
  | "context_frozen";

const REASON_MESSAGES: Record<UpgradeReason, string> = {
  upload_document: "Free users cannot upload new documents. Upgrade for unlimited uploads.",
  chat_image: "Free users cannot upload images in chat. Upgrade for image analysis.",
  daily_limit: "Daily free message limit (3) reached. Try again tomorrow or upgrade for unlimited chat. You can also log symptoms in Calendar.",
  message_length: `Free users are limited to ${FREE_MAX_MESSAGE_LENGTH} characters per message. Upgrade for longer input.`,
  context_frozen: "Free users' health profile won't sync to AI context in real time. Upgrade for live sync.",
};

export function getUpgradeMessage(reason: UpgradeReason): string {
  return REASON_MESSAGES[reason];
}
