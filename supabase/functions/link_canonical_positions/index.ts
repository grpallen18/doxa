// Supabase Edge Function: link story_positions to canonical_positions via embedding similarity.
// Creates new canonical_positions when no match above threshold. Required for every new story_position.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, SIMILARITY_THRESHOLD.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_positions?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;
const DEFAULT_MAX_POSITIONS = 10;
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function clampNum(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

async function maybeInvokeAssignRankedSubtopics(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRole: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return;
  try {
    const { data: positions } = await supabase
      .from("canonical_positions")
      .select("canonical_position_id")
      .not("embedding", "is", null);

    const { data: subtopics } = await supabase
      .from("position_subtopics")
      .select("canonical_position_id");

    const assignedIds = new Set((subtopics ?? []).map((r: { canonical_position_id: string }) => r.canonical_position_id));
    const hasEligible = (positions ?? []).some(
      (p: { canonical_position_id: string }) => !assignedIds.has(p.canonical_position_id)
    );

    if (!hasEligible) return;

    const fnUrl = `${supabaseUrl}/functions/v1/assign_ranked_subtopics`;
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_positions: 20 }),
    });
    const assignResult = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[link_canonical_positions] assign_ranked_subtopics failed:", res.status, assignResult);
    }
  } catch (e) {
    console.warn("[link_canonical_positions] assign_ranked_subtopics invoke failed:", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  const similarityThreshold = clampNum(
    Deno.env.get("SIMILARITY_THRESHOLD"),
    0,
    1,
    DEFAULT_SIMILARITY_THRESHOLD
  );

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    // use defaults
  }
  const maxPositions = clampInt(body.max_positions, 1, 50, DEFAULT_MAX_POSITIONS);
  const dryRun = Boolean(body.dry_run ?? false);

  const maxDistance = 1 - similarityThreshold;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: rows, error: fetchErr } = await supabase
    .from("story_positions")
    .select("story_position_id, raw_text")
    .is("canonical_position_id", null)
    .order("created_at", { ascending: true })
    .limit(maxPositions);

  if (fetchErr) {
    console.error("[link_canonical_positions] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const storyPositions = (Array.isArray(rows) ? rows : []).filter(
    (r): r is { story_position_id: string; raw_text: string } =>
      typeof r === "object" && r !== null && typeof (r as { story_position_id: unknown }).story_position_id === "string"
  );

  if (storyPositions.length === 0) {
    await maybeInvokeAssignRankedSubtopics(supabase, SUPABASE_URL, SERVICE_ROLE, dryRun);
    return json({ ok: true, processed: 0, linked: 0, created: 0, message: "No story_positions to link", dry_run: dryRun });
  }

  let linked = 0;
  let created = 0;

  for (const sp of storyPositions) {
    const rawText = (sp.raw_text ?? "").trim();
    if (!rawText) continue;

    let embedding: number[];
    try {
      embedding = await getEmbedding(OPENAI_API_KEY, rawText, MODEL);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[link_canonical_positions] Embedding error:", msg);
      return json({ error: msg, story_position_id: sp.story_position_id }, 500);
    }

    const embeddingStr = `[${embedding.join(",")}]`;

    const { data: matchRows, error: rpcErr } = await supabase.rpc("match_positions_nearest", {
      query_embedding: embeddingStr,
      match_count: 1,
    });

    if (rpcErr) {
      console.error("[link_canonical_positions] RPC error:", rpcErr.message);
      return json({ error: rpcErr.message, story_position_id: sp.story_position_id }, 500);
    }

    const matches = Array.isArray(matchRows) ? matchRows : [];
    const best = matches[0] as { canonical_position_id?: string; distance?: number } | undefined;
    const distance = typeof best?.distance === "number" ? best.distance : 1;

    if (distance <= maxDistance && best?.canonical_position_id) {
      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("story_positions")
          .update({ canonical_position_id: best.canonical_position_id, embedding: embeddingStr })
          .eq("story_position_id", sp.story_position_id);

        if (upErr) {
          console.error("[link_canonical_positions] Update link error:", upErr.message);
          return json({ error: upErr.message }, 500);
        }
      }
      linked += 1;
    } else {
      const normalized = rawText.toLowerCase().trim().replace(/\s+/g, " ");
      let canonicalHash = await sha256Hex(normalized);
      if (dryRun) {
        created += 1;
      } else {
        let attempts = 0;
        while (attempts < 5) {
          const { data: ins, error: insErr } = await supabase
            .from("canonical_positions")
            .insert({
              canonical_text: rawText,
              canonical_hash: canonicalHash,
              embedding: embeddingStr,
              metadata: {},
            })
            .select("canonical_position_id")
            .single();

          if (!insErr) {
            const { error: upErr } = await supabase
              .from("story_positions")
              .update({ canonical_position_id: ins?.canonical_position_id, embedding: embeddingStr })
              .eq("story_position_id", sp.story_position_id);

            if (upErr) {
              console.error("[link_canonical_positions] Update new position error:", upErr.message);
              return json({ error: upErr.message }, 500);
            }
            created += 1;
            break;
          }

          if (insErr.code === "23505") {
            canonicalHash = `${canonicalHash}_${crypto.randomUUID().slice(0, 8)}`;
            attempts += 1;
            continue;
          }

          console.error("[link_canonical_positions] Insert position error:", insErr.message);
          return json({ error: insErr.message }, 500);
        }
      }
    }
  }

  await maybeInvokeAssignRankedSubtopics(supabase, SUPABASE_URL, SERVICE_ROLE, dryRun);
  return json({
    ok: true,
    processed: storyPositions.length,
    linked,
    created,
    similarity_threshold: similarityThreshold,
    dry_run: dryRun,
  });
});
