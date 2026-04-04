import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { refreshDocumentContext } from "../_shared/documentContext.ts";

const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  const now = new Date().toISOString();

  const { data: jobs, error } = await supabaseAdmin
    .from("summary_generation_queue")
    .select("*")
    .eq("status", "pending")
    .eq("level", "document_context")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (error) {
    return new Response(`queue fetch error: ${error.message}`, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return new Response("no jobs due", { status: 200 });
  }

  const jobIds = jobs.map((j) => j.id as string);
  await supabaseAdmin.from("summary_generation_queue").update({ status: "processing" }).in("id", jobIds);

  const results = await Promise.allSettled(jobs.map((job) => processJob(job)));

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return new Response(JSON.stringify({ processed: jobs.length, succeeded, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function processJob(job: Record<string, unknown>) {
  const id = job.id as string;
  const userId = job.user_id as string;
  try {
    await refreshDocumentContext(supabaseAdmin, userId);

    await supabaseAdmin
      .from("summary_generation_queue")
      .update({
        status: "done",
        processed_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await supabaseAdmin
      .from("summary_generation_queue")
      .update({
        status: "failed",
        error: message,
      })
      .eq("id", id);

    throw error;
  }
}
