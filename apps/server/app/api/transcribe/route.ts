import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (user?.id) return user.id;

  const { data: claimsData } = await supabaseAdmin.auth.getClaims(token);
  if (claimsData?.claims?.sub) return String(claimsData.claims.sub);

  return null;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { error: "未登录，请先完成认证" },
      { status: 401, headers: corsHeaders }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "服务配置有误，请稍后再试。" },
      { status: 500, headers: corsHeaders }
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "请求格式错误" },
      { status: 400, headers: corsHeaders }
    );
  }

  const filePart = formData.get("file");
  if (!filePart || typeof filePart === "string") {
    return NextResponse.json(
      { error: "缺少音频文件" },
      { status: 400, headers: corsHeaders }
    );
  }

  // React Native / web runtime 的 multipart 解析实现可能不同，避免严格依赖 File 实例判断
  const blobLike = filePart as Blob;
  const hasArrayBuffer = typeof (blobLike as { arrayBuffer?: unknown }).arrayBuffer === "function";
  if (!hasArrayBuffer) {
    return NextResponse.json(
      { error: "音频文件格式不受支持" },
      { status: 400, headers: corsHeaders }
    );
  }

  const fileName =
    "name" in (filePart as Record<string, unknown>) &&
    typeof (filePart as { name?: string }).name === "string"
      ? (filePart as { name: string }).name
      : "recording.m4a";
  const mimeType =
    "type" in (filePart as Record<string, unknown>) &&
    typeof (filePart as { type?: string }).type === "string" &&
    (filePart as { type: string }).type
      ? (filePart as { type: string }).type
      : "audio/m4a";

  if (!(mimeType.startsWith("audio/") || mimeType === "application/octet-stream")) {
    return NextResponse.json(
      { error: `上传内容不是音频文件: ${mimeType}` },
      { status: 400, headers: corsHeaders }
    );
  }
  const normalizedFile = new File([await blobLike.arrayBuffer()], fileName, {
    type: mimeType,
  });

  const requestedModel = String(formData.get("model") ?? "gpt-4o-mini-transcribe");
  const model = requestedModel === "whisper-1" ? "whisper-1" : "gpt-4o-mini-transcribe";

  try {
    const openai = new OpenAI({ apiKey });
    const result = await openai.audio.transcriptions.create({
      file: normalizedFile,
      model,
      language: "zh",
    });

    return NextResponse.json(
      { text: result.text ?? "" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[transcribe] OpenAI error:", error);
    return NextResponse.json(
      { error: "语音识别失败，请稍后重试" },
      { status: 500, headers: corsHeaders }
    );
  }
}
