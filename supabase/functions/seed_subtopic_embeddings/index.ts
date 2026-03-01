// One-time Edge Function: embed all subtopics for match_subtopics_nearest.
// Run after 103_seed_topic_subtopic_taxonomy. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

async function getEmbedding(apiKey: string, text: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DEFAULT_EMBEDDING_DIMS) {
    throw new Error("Invalid embedding response");
  }
  return emb;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: subtopics, error: fetchErr } = await supabase
    .from("subtopics")
    .select("subtopic_id, name, description, topic_id");

  if (fetchErr) {
    console.error("[seed_subtopic_embeddings] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const rows = Array.isArray(subtopics) ? subtopics : [];
  let updated = 0;

  for (const s of rows) {
    const text = [s.name, s.description].filter(Boolean).join(". ");
    if (!text.trim()) continue;

    try {
      const embedding = await getEmbedding(OPENAI_API_KEY, text, MODEL);
      const embeddingStr = `[${embedding.join(",")}]`;

      const { error: upErr } = await supabase
        .from("subtopics")
        .update({ embedding: embeddingStr })
        .eq("subtopic_id", s.subtopic_id);

      if (upErr) {
        console.error("[seed_subtopic_embeddings] Update error:", upErr.message);
        return json({ error: upErr.message, subtopic_id: s.subtopic_id }, 500);
      }
      updated += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg, subtopic_id: s.subtopic_id }, 500);
    }
  }

  return json({ ok: true, updated, total: rows.length });
});
