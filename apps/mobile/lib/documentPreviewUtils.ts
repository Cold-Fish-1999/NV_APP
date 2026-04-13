/**
 * 根据 mime 与文件名/路径判断预览方式（上传草稿与已存记录共用）
 */
export type DocumentPreviewKind = "image" | "pdf" | "text" | "office" | "unknown";

export function guessDocumentPreviewKind(
  mime: string | null | undefined,
  filenameOrPath: string,
): DocumentPreviewKind {
  const m = (mime ?? "").toLowerCase();
  const ext = filenameOrPath.includes(".")
    ? filenameOrPath.split(".").pop()?.toLowerCase() ?? ""
    : "";

  if (m.startsWith("image/")) return "image";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)) return "image";

  if (m === "application/pdf" || ext === "pdf") return "pdf";

  if (m.startsWith("text/") || ["txt", "md", "markdown"].includes(ext)) return "text";

  if (
    ext === "doc" ||
    ext === "docx" ||
    m.includes("wordprocessingml") ||
    m === "application/msword"
  ) {
    return "office";
  }

  return "unknown";
}
