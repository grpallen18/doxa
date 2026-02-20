// Supabase Edge Function: label_thesis.
// DEPRECATED: Theses table and related RPCs were dropped in migration 069.
// This function returns 410 Gone. Remove from cron if still scheduled.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  return json(
    { error: "Deprecated: theses table dropped. Use controversy_viewpoints instead." },
    410
  );
});
