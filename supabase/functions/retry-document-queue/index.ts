import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: retried, error } = await supabaseAdmin
    .from("summary_generation_queue")
    .update({
      status: "pending",
      scheduled_at: new Date().toISOString(),
      error: null,
    })
    .eq("level", "document_context")
    .eq("status", "failed")
    .gte("created_at", cutoff)
    .select("id");

  if (error) {
    return new Response(`retry error: ${error.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ retried: retried?.length ?? 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
