import { NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { incrementalRefreshDocumentContext } from "@/lib/documentContext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** 缩小后再送视觉模型，降低 token / 费用（与客户端上传缩放叠加） */
const MAX_IMAGE_EDGE = 896;

async function imageUrlToJpegDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(buf)
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

function getProfileDocModel() {
  return (process.env.PROFILE_DOC_MODEL ?? "gpt-5").trim() || "gpt-5";
}

function parseOutput(
  raw: string,
  uploadIds: string[]
): {
  title: string;
  combinedSummary: string;
  itemSummaries: Array<{ uploadId: string; summary: string; extractedText: string }>;
} {
  try {
    const obj = JSON.parse(raw) as {
      title?: unknown;
      combined_summary?: unknown;
      items?: unknown;
    };
    const title =
      typeof obj.title === "string" && obj.title.trim().length > 0
        ? obj.title.trim()
        : "Medical Document";
    const combinedSummary =
      typeof obj.combined_summary === "string" && obj.combined_summary.trim().length > 0
        ? obj.combined_summary.trim()
        : "Could not extract sufficient information from the uploaded images.";
    const items = Array.isArray(obj.items) ? obj.items : [];
    const itemMap = new Map<string, { summary: string; extractedText: string }>();
    for (const item of items) {
      const cur = item as Record<string, unknown>;
      const uploadId = String(cur.upload_id ?? "");
      if (!uploadId) continue;
      const summary = typeof cur.summary === "string" ? cur.summary.trim() : "";
      const extractedText =
        typeof cur.extracted_text === "string" ? cur.extracted_text.trim() : "";
      itemMap.set(uploadId, {
        summary: summary || "未能从该图片提取到足够信息。",
        extractedText,
      });
    }
    const itemSummaries = uploadIds.map((id) => ({
      uploadId: id,
      summary: itemMap.get(id)?.summary ?? "未能从该图片提取到足够信息。",
      extractedText: itemMap.get(id)?.extractedText ?? "",
    }));
    return { title, combinedSummary, itemSummaries };
  } catch {
    return {
      title: "Medical Document",
      combinedSummary: "Could not extract sufficient information from the uploaded images.",
      itemSummaries: uploadIds.map((id) => ({
        uploadId: id,
        summary: "Could not extract sufficient information.",
        extractedText: "",
      })),
    };
  }
}

export const maxDuration = 120;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

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
    error: authErr,
  } = await supabaseAdmin.auth.getUser(token);
  const userId = user?.id ?? null;
  if (!userId) {
    return NextResponse.json(
      { error: authErr?.message ?? "认证失效，请重新登录" },
      { status: 401, headers: corsHeaders }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { uploadId?: string; uploadIds?: string[]; userRemark?: string }
    | null;
  const userRemark =
    typeof body?.userRemark === "string" ? body.userRemark.trim() : "";
  const uploadIds = Array.isArray(body?.uploadIds)
    ? body?.uploadIds.map((x) => String(x).trim()).filter(Boolean)
    : body?.uploadId
      ? [String(body.uploadId).trim()]
      : [];
  if (uploadIds.length === 0) {
    return NextResponse.json(
      { error: "缺少 uploadIds" },
      { status: 400, headers: corsHeaders }
    );
  }

  const rowsResult = await supabaseAdmin
    .from("profile_document_uploads")
    .select("id, user_id, record_id, category, storage_bucket, storage_path")
    .in("id", uploadIds);
  let rows = rowsResult.data as Array<{
    id: string;
    user_id: string;
    record_id: string;
    category: string;
    storage_bucket: string;
    storage_path: string;
  }> | null;
  if (rowsResult.error) {
    if (String(rowsResult.error.code) === "42703") {
      const legacyRows = await supabaseAdmin
        .from("profile_document_uploads")
        .select("id, user_id, category, storage_bucket, storage_path")
        .in("id", uploadIds);
      if (legacyRows.error) {
        return NextResponse.json(
          { error: legacyRows.error.message },
          { status: 500, headers: corsHeaders }
        );
      }
      rows = (legacyRows.data ?? []).map((x) => ({
        ...(x as {
          id: string;
          user_id: string;
          category: string;
          storage_bucket: string;
          storage_path: string;
        }),
        record_id: (x as { id: string }).id,
      }));
    } else {
      return NextResponse.json(
        { error: rowsResult.error.message },
        { status: 500, headers: corsHeaders }
      );
    }
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "记录不存在或无权限" },
      { status: 404, headers: corsHeaders }
    );
  }
  if (rows.some((r) => r.user_id !== userId)) {
    return NextResponse.json(
      { error: "包含无权限记录" },
      { status: 403, headers: corsHeaders }
    );
  }
  const t0 = Date.now();
  const lap = (label: string) => console.log(`[doc-analyze] ${label}: ${Date.now() - t0}ms`);

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const orderedRows = uploadIds
    .map((id) => rowById.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const recordIds = Array.from(new Set(orderedRows.map((r) => r.record_id)));
  const legacyMode = recordIds.every((id) => uploadIds.includes(id));
  if (recordIds.length !== 1 && !legacyMode) {
    return NextResponse.json(
      { error: "一次分析仅支持同一条记录的图片" },
      { status: 400, headers: corsHeaders }
    );
  }
  const recordId = recordIds[0] ?? "";
  lap(`db-query (${orderedRows.length} rows)`);

  const signedUrlResults = await Promise.all(
    orderedRows.map(async (row) => {
      const { data: signed, error: signedErr } = await supabaseAdmin
        .storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, 60 * 10);
      if (signedErr || !signed?.signedUrl) {
        throw new Error(signedErr?.message ?? `无法读取上传图片: ${row.id}`);
      }
      return { row, signedUrl: signed.signedUrl };
    })
  ).catch((e) => e);
  if (signedUrlResults instanceof Error) {
    return NextResponse.json(
      { error: signedUrlResults.message },
      { status: 500, headers: corsHeaders }
    );
  }
  lap("signed-urls");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set" },
      { status: 500, headers: corsHeaders }
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = getProfileDocModel();

  try {
    const jpegUrls = await Promise.all(
      signedUrlResults.map(async (x) => {
        const dataUrl = await imageUrlToJpegDataUrl(x.signedUrl);
        return { ...x, jpegDataUrl: dataUrl };
      })
    );
    lap(`image-download+resize (${jpegUrls.length} images)`);

    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a medical document extraction assistant for a personal health profile. CRITICAL RULE: If ALL uploaded images are unrelated to health (e.g. landscape photos, selfies, memes, screenshots of non-health apps, food photos, random images), you MUST return: {title: \"Not a health document\", combined_summary: \"This doesn't appear to be a health-related document. Please upload medical records, lab results, prescriptions, or health app screenshots.\", items: [{upload_id: \"...\", summary: \"Not health-related\", extracted_text: \"\"}]}. Do NOT describe, analyze, or comment on non-health images. For health-related images, output strict JSON: {title: string, combined_summary: string, items: [{upload_id: string, summary: string, extracted_text: string}]}. IMPORTANT: If the document contains a date (exam date, report date, prescription date, lab collection date), you MUST include it prominently at the beginning of the summary, e.g. 'Dated March 15, 2026 — Blood test showing...'. title: concise (5-15 words) including date if available, e.g. 'Mar 2026 Blood Test — Elevated CRP'. combined_summary: 80-200 words unified summary; start with the document date if found; incorporate user notes if provided. items: one per image, summary 50-120 words — begin with date if visible; extracted_text: key original text, max 1200 chars.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userRemark
                ? `用户提供了以下背景备注，请结合备注与图片内容进行分析：\n\n【用户备注】\n${userRemark}\n\n请分析以下 ${jpegUrls.length} 张资料图片，结合用户备注进行统一总结与逐图总结。`
                : `请分析以下 ${jpegUrls.length} 张资料图片，并返回统一总结与逐图总结。`,
            },
            ...jpegUrls.flatMap((x, idx) => ([
              {
                type: "text",
                text: `图片${idx + 1} upload_id=${x.row.id} category=${x.row.category}`,
              },
              { type: "image_url", image_url: { url: x.jpegDataUrl } },
            ])),
          ] as never,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    lap(`openai-vision (model=${model})`);
    const parsed = parseOutput(raw, uploadIds);
    const itemMap = new Map(parsed.itemSummaries.map((x) => [x.uploadId, x]));
    for (const row of orderedRows) {
      const item = itemMap.get(row.id);
      const updatePayload: Record<string, unknown> = {
        ai_summary: item?.summary ?? "未能从该图片提取到足够信息。",
        extracted_text: item?.extractedText ?? "",
        status: "ready",
      };
      if (recordId) {
        updatePayload.group_ai_summary = parsed.combinedSummary;
        updatePayload.group_title = parsed.title;
      }
      let updateRes = await supabaseAdmin
        .from("profile_document_uploads")
        .update(updatePayload)
        .eq("id", row.id)
        .eq("user_id", userId)
        .select("id, category, ai_summary, created_at");
      if (updateRes.error && String(updateRes.error.code) === "42703") {
        const { group_ai_summary: _drop, group_title: _drop2, ...legacyPayload } = updatePayload;
        updateRes = await supabaseAdmin
          .from("profile_document_uploads")
          .update(legacyPayload)
          .eq("id", row.id)
          .eq("user_id", userId)
          .select("id, category, ai_summary, created_at");
      }
      const updateErr = updateRes.error;
      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message },
          { status: 500, headers: corsHeaders }
        );
      }
      const completed = updateRes.data?.[0] as
        | { id: string; category: string; ai_summary: string | null; created_at: string }
        | undefined;
      const isHealthRelevant = parsed.title !== "Not a health document";
      if (completed?.ai_summary && isHealthRelevant) {
        try {
          await incrementalRefreshDocumentContext(userId, {
            id: completed.id,
            category: completed.category,
            ai_summary: completed.ai_summary,
            created_at: completed.created_at,
          });
        } catch (ctxErr) {
          console.error("[profile-document-analyze] incrementalRefreshDocumentContext:", ctxErr);
        }
      } else if (!isHealthRelevant) {
        console.log("[doc-analyze] Skipping context refresh — not a health document");
      }
    }

    lap(`db-update+context-refresh (${orderedRows.length} rows)`);
    console.log(`[doc-analyze] TOTAL: ${Date.now() - t0}ms for ${orderedRows.length} images`);

    return NextResponse.json(
      {
        ok: true,
        combinedSummary: parsed.combinedSummary,
        itemSummaries: parsed.itemSummaries,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: corsHeaders }
    );
  }
}
