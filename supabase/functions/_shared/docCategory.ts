/** 与 apps/mobile/lib/profileService 对齐：DB 历史值 → 展示用 slug + 英文标题 */

export type DocCategory = "medical_record" | "checkup_report" | "tracker_app" | "other";

const LABELS: Record<DocCategory, string> = {
  medical_record: "Medical Records & Cases",
  checkup_report: "Checkup Reports",
  tracker_app: "Other Health APP Data",
  other: "Other",
};

export function normalizeDocCategory(raw: string | null | undefined): DocCategory {
  if (raw == null || raw === "") return "other";
  switch (raw) {
    case "medical_record":
    case "checkup_report":
    case "tracker_app":
    case "other":
      return raw;
    case "other_app":
      return "other";
    case "treatment_record":
      return "medical_record";
    default:
      return "other";
  }
}

export function docCategoryLabel(raw: string | null | undefined): string {
  return LABELS[normalizeDocCategory(raw)];
}
