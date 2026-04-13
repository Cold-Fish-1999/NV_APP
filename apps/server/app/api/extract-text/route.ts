import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import mammoth from "mammoth";
import { extractPdfText } from "@/lib/pdfText";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: corsHeaders });
  }
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user?.id) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: corsHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const { bucket, path: storagePath } = body as { bucket?: string; path?: string };

  if (!bucket || !storagePath) {
    return NextResponse.json(
      { error: "bucket and path required" },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!storagePath.startsWith(user.id)) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403, headers: corsHeaders },
    );
  }

  try {
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);

    if (dlErr || !fileData) {
      return NextResponse.json(
        { error: `File download failed: ${dlErr?.message ?? "not found"}` },
        { status: 404, headers: corsHeaders },
      );
    }

    if (fileData.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 20MB)" },
        { status: 413, headers: corsHeaders },
      );
    }

    const buf = Buffer.from(await fileData.arrayBuffer());
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
    let text = "";

    if (ext === "pdf") {
      text = await extractPdfText(buf);
    } else if (ext === "docx" || ext === "doc") {
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (ext === "txt" || ext === "md") {
      text = buf.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext}` },
        { status: 400, headers: corsHeaders },
      );
    }

    const trimmed = text.trim();
    const truncated = trimmed.length > 50000 ? trimmed.slice(0, 50000) + "\n...[truncated]" : trimmed;

    return NextResponse.json(
      { text: truncated, charCount: trimmed.length, truncated: trimmed.length > 50000 },
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error("[extract-text]", e);
    return NextResponse.json(
      { error: `Extraction failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500, headers: corsHeaders },
    );
  }
}
