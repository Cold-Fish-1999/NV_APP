import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { scheduleFullRefreshDocumentContext } from "@/lib/documentContext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * 客户端删除档案资料后调用：仅入队防抖后的全文重建，不直接跑推理。
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json(
      { error: "未登录，请先完成认证" },
      { status: 401, headers: corsHeaders }
    );
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  const userId = user?.id ?? null;
  if (!userId) {
    return NextResponse.json(
      { error: error?.message ?? "认证失效，请重新登录" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    await scheduleFullRefreshDocumentContext(userId);
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: corsHeaders }
    );
  }
}
