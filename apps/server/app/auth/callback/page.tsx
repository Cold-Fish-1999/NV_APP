"use client";

import { useEffect, useState } from "react";

/**
 * Magic Link 中转页
 * Supabase 重定向到此页（带 hash），此页再跳转到 exp:// 打开 App
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"redirecting" | "open" | "error">("redirecting");

  useEffect(() => {
    const hash = window.location.hash;
    const host = window.location.hostname;
    const expBase = process.env.NEXT_PUBLIC_EXPO_DEV_URL || `exp://${host}:8081`;
    const expUrl = `${expBase}/--/auth/callback${hash}`;

    const timer = setTimeout(() => {
      window.location.href = expUrl;
      setStatus("open");
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const expBase = process.env.NEXT_PUBLIC_EXPO_DEV_URL || `exp://${host}:8081`;
  const expUrl = `${expBase}/--/auth/callback${hash}`;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <p style={{ fontSize: 18, marginBottom: 16 }}>
        {status === "redirecting" ? "正在打开 App..." : "请点击下方按钮"}
      </p>
      <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
        邮箱内嵌浏览器可能无法自动跳转，请务必点击按钮
      </p>
      <a
        href={expUrl}
        onClick={() => setStatus("open")}
        style={{
          display: "inline-block",
          padding: "18px 40px",
          backgroundColor: "#2563eb",
          color: "#fff",
          borderRadius: 12,
          textDecoration: "none",
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        打开 NVAPP
      </a>
    </div>
  );
}
