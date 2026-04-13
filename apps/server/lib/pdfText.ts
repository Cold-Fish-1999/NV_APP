import { createRequire } from "node:module";

type PdfParseResult = { text: string };
type PdfParseFn = (data: Buffer) => Promise<PdfParseResult>;

/**
 * pdf-parse@1.1.1 为 CommonJS；用 createRequire 加载，避免：
 * 1) ESM `import()` 时 `module.parent` 为空，触发其 index 里误跑的调试代码（读 test 文件 ENOENT）
 * 2) Next 将 pdf.js 打进 RSC bundle 导致 defineProperty 报错 — 配合 serverExternalPackages
 */
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as PdfParseFn;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return (data.text ?? "").trim();
}
