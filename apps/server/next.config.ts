import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nvapp/shared"],
  /** 勿将 pdf-parse / pdf.js 打进 RSC bundle，否则会触发运行时 defineProperty 等错误 */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
