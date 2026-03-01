// Supabase Edge Function: assign 1-5 ranked subtopics per canonical position.
// Uses retrieval (match_subtopics_nearest) + LLM selection. Run after link_canonical_positions.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_positions?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;
const DEFAULT_MAX_POSITIONS = 5;
const CANDIDATE_COUNT = 25;

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

type SubtopicCandidate = { subtopic_id: string; name: string; topic_name: string; distance: number };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_EMBEDDING_MODEL;

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
  const maxPositions = clampInt(body.max_positions, 1, 20, DEFAULT_MAX_POSITIONS);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: unassigned } = await supabase
    .from("canonical_positions")
    .select("canonical_position_id, canonical_text, embedding")
    .not("embedding", "is", null);

  const allPositions = Array.isArray(unassigned) ? unassigned : [];
  const { data: hasSubtopics } = await supabase
    .from("position_subtopics")
    .select("canonical_position_id");

  const assignedIds = new Set((Array.isArray(hasSubtopics) ? hasSubtopics : []).map((r: { canonical_position_id: string }) => r.canonical_position_id));
  const toProcess = allPositions
    .filter((p: { canonical_position_id: string }) => !assignedIds.has(p.canonical_position_id))
    .slice(0, maxPositions);

  if (toProcess.length === 0) {
    return json({ ok: true, processed: 0, message: "No positions to assign", dry_run: dryRun });
  }

  const { data: otherSubtopics } = await supabase
    .from("subtopics")
    .select("subtopic_id, topic_id")
    .eq("name", "Other");
  const otherByTopic = new Map<string, string>();
  for (const o of Array.isArray(otherSubtopics) ? otherSubtopics : []) {
    otherByTopic.set(o.topic_id, o.subtopic_id);
  }

  let processed = 0;

  for (const pos of toProcess) {
    const text = (pos.canonical_text ?? "").trim();
    if (!text) continue;

    let embeddingStr: string;
    if (pos.embedding && typeof pos.embedding === "string") {
      embeddingStr = pos.embedding;
    } else {
      const embedding = await getEmbedding(OPENAI_API_KEY, text, EMBEDDING_MODEL);
      embeddingStr = `[${embedding.join(",")}]`;
    }

    const { data: matches } = await supabase.rpc("match_subtopics_nearest", {
      query_embedding: embeddingStr,
      match_count: CANDIDATE_COUNT,
    });

    const matchRows = Array.isArray(matches) ? matches : [];
    if (matchRows.length === 0) {
      const { data: firstTopic } = await supabase.from("topics").select("topic_id").limit(1).single();
      const fallbackSubtopicId = firstTopic?.topic_id ? otherByTopic.get(firstTopic.topic_id) : null;
      if (fallbackSubtopicId && !dryRun) {
        await supabase.from("position_subtopics").insert({
          canonical_position_id: pos.canonical_position_id,
          subtopic_id: fallbackSubtopicId,
          rank: 1,
          confidence: 0.5,
        });
        const { data: st } = await supabase.from("subtopics").select("topic_id").eq("subtopic_id", fallbackSubtopicId).single();
        if (st?.topic_id) {
          await supabase.from("canonical_positions").update({ primary_topic_id: st.topic_id, updated_at: new Date().toISOString() }).eq("canonical_position_id", pos.canonical_position_id);
        }
      }
      processed += 1;
      continue;
    }

    const { data: subtopicDetails } = await supabase
      .from("subtopics")
      .select("subtopic_id, name, topic_id")
      .in("subtopic_id", matchRows.map((m: { subtopic_id: string }) => m.subtopic_id));

    const topicIds = [...new Set((subtopicDetails ?? []).map((s: { topic_id: string }) => s.topic_id))];
    const { data: topics } = await supabase.from("topics").select("topic_id, name").in("topic_id", topicIds);
    const topicMap = new Map((topics ?? []).map((t: { topic_id: string; name: string }) => [t.topic_id, t.name]));

    const candidates: SubtopicCandidate[] = matchRows.map((m: { subtopic_id: string; distance: number }) => {
      const d = subtopicDetails?.find((s: { subtopic_id: string }) => s.subtopic_id === m.subtopic_id);
      return {
        subtopic_id: m.subtopic_id,
        name: d?.name ?? "Unknown",
        topic_name: topicMap.get(d?.topic_id ?? "") ?? "Unknown",
        distance: m.distance ?? 1,
      };
    });

    const system = `You assign 1-5 ranked subtopics to a position statement. Choose from the candidate list in rank order (rank 1 = best fit). Output JSON: { "selections": [ { "subtopic_id": "uuid", "rank": 1, "confidence": 0.9 }, ... ] }. If none fit well, output { "selections": [], "propose_new": "Proposed subtopic name" }. Max 5 selections.`;
    const user = `Position: "${text}"\nCandidates:\n${candidates.map((c) => `- ${c.subtopic_id}: ${c.name} (${c.topic_name})`).join("\n")}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[assign_ranked_subtopics] OpenAI error:", err.slice(0, 300));
      return json({ error: `OpenAI ${resp.status}: ${err.slice(0, 200)}`, canonical_position_id: pos.canonical_position_id }, 500);
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const contentStr = data?.choices?.[0]?.message?.content;
    if (typeof contentStr !== "string") return json({ error: "Missing OpenAI content" }, 500);

    const parsed = JSON.parse(contentStr) as {
      selections?: Array<{ subtopic_id?: string; rank?: number; confidence?: number }>;
      propose_new?: string;
    };
    const selections = Array.isArray(parsed?.selections) ? parsed.selections : [];

    if (selections.length === 0) {
      const firstTopicId = candidates[0] ? (subtopicDetails?.find((s: { subtopic_id: string }) => s.subtopic_id === candidates[0].subtopic_id) as { topic_id?: string } | undefined)?.topic_id : null;
      const fallbackSubtopicId = firstTopicId ? otherByTopic.get(firstTopicId) : null;
      if (fallbackSubtopicId && !dryRun) {
        await supabase.from("position_subtopics").insert({
          canonical_position_id: pos.canonical_position_id,
          subtopic_id: fallbackSubtopicId,
          rank: 1,
          confidence: 0.5,
        });
        const { data: st } = await supabase.from("subtopics").select("topic_id").eq("subtopic_id", fallbackSubtopicId).single();
        if (st?.topic_id) {
          await supabase.from("canonical_positions").update({ primary_topic_id: st.topic_id, updated_at: new Date().toISOString() }).eq("canonical_position_id", pos.canonical_position_id);
        }
        if (parsed.propose_new && typeof parsed.propose_new === "string") {
          const { data: pend } = await supabase
            .from("pending_subtopics")
            .insert({ proposed_name: parsed.propose_new, suggested_topic_id: firstTopicId, example_position_id: pos.canonical_position_id, status: "pending" })
            .select("pending_id")
            .single();
          if (pend?.pending_id) {
            await supabase.from("position_pending_subtopics").insert({ canonical_position_id: pos.canonical_position_id, pending_id: pend.pending_id });
          }
        }
      }
      processed += 1;
      continue;
    }

    const sorted = selections
      .filter((s) => s.subtopic_id && s.rank >= 1 && s.rank <= 5)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .slice(0, 5);

    if (!dryRun && sorted.length > 0) {
      await supabase.from("position_subtopics").delete().eq("canonical_position_id", pos.canonical_position_id);
      for (const s of sorted) {
        await supabase.from("position_subtopics").insert({
          canonical_position_id: pos.canonical_position_id,
          subtopic_id: s.subtopic_id!,
          rank: s.rank ?? 1,
          confidence: typeof s.confidence === "number" ? s.confidence : 0.8,
        });
      }
      const rank1 = sorted[0];
      const { data: st } = await supabase.from("subtopics").select("topic_id").eq("subtopic_id", rank1.subtopic_id).single();
      if (st?.topic_id) {
        await supabase.from("canonical_positions").update({ primary_topic_id: st.topic_id, updated_at: new Date().toISOString() }).eq("canonical_position_id", pos.canonical_position_id);
      }
    }
    processed += 1;
  }

  return json({ ok: true, processed, dry_run: dryRun });
});
