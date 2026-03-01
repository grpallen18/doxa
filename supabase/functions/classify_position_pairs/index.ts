// Supabase Edge Function: classify position pairs (relation + alignment).
// Populates position_relationships. Topic-scoped: Stream A (KNN in topic), Stream B (overlapping subtopics).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_positions?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const K = 15;
const MAX_POSITIONS_PER_RUN = 20;
const PAIRS_PER_BATCH = 10;
const MAX_PAIRS_PER_RUN = 30;
const DEFAULT_MODEL = "gpt-5-mini";

type Relation = "direct" | "indirect" | "orthogonal" | "none";
type Alignment = "agree" | "conflict" | "independent" | "unclear";

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

function parseEmbedding(v: unknown): string | null {
  if (Array.isArray(v)) return `[${(v as number[]).join(",")}]`;
  if (typeof v === "string" && v.startsWith("[")) return v;
  return null;
}

type StoryContext = { title: string; published_at: string | null };

async function classifyBatch(
  apiKey: string,
  model: string,
  pairs: Array<{ textA: string; textB: string; contextA?: StoryContext; contextB?: StoryContext }>
): Promise<Array<{ relation: Relation; alignment: Alignment; reasoning?: string }>> {
  if (pairs.length === 0) return [];

  const fmtContext = (ctx?: StoryContext) => {
    if (!ctx) return "";
    const date = ctx.published_at ?? "date unknown";
    return ` (Source: "${ctx.title}", ${date})`;
  };

  const blocks = pairs
    .map(
      (p, i) =>
        `Pair ${i + 1}:\nPosition A: ${p.textA}${fmtContext(p.contextA)}\nPosition B: ${p.textB}${fmtContext(p.contextB)}`
    )
    .join("\n\n");

  const system = `You are classifying pairs of positions that share a topic and subtopic. For each pair, output both a relation and an alignment. Do not default to orthogonal — most pairs that share a subtopic will be direct or indirect. Make reasonable assumptions from the advocate's perspective.

When source context is provided (story title, date), use it: if the two positions clearly refer to different events or time periods, prefer orthogonal.

STEP 1 - Relation (are they about the same event/decision?):
Do these two positions address the same action, policy, or event?
- direct: Both clearly address the same decision. Ex: "The administration's action was reckless and unlawful" vs "Threats from Iran made the military response necessary" — same event, opposite stances, different wording.
- indirect: Different angles but bear on the same decision. Ex: "The ban improves public health" vs "Federal law preempts the ban" — same policy, different arguments.
- orthogonal: Same subtopic but different propositions with no meaningful overlap. Ex: "Congress should pass the infrastructure bill" vs "Housing prices in Austin rose 20%" — both policy/economics, but different events; an advocate of one would not typically be debating the other. Also use when source context clearly indicates different events or time periods. Example: US armed conflict with Iran in 2010 vs 2020 could be directly related or orthogonal depending on the statements, so keep the event and time period in mind when making your decision.
- none: Unrelated.

STEP 2 - Alignment (when relation is direct or indirect):
Put yourself in the shoes of someone advocating position A. Would you agree or disagree with position B?
- agree: Same side. You would endorse the other position.
- conflict: Opposite sides. You would oppose the other position.
- independent: Only when relation is orthogonal or none.

REQUIRED: For each pair you MUST include a "reasoning" field (1-2 sentences) explaining why you chose that relation and alignment. This is required for every object.

Output a JSON array of exactly ${pairs.length} objects. Each object MUST have: "relation", "alignment", and "reasoning". Example: [ { "relation": "direct", "alignment": "conflict", "reasoning": "Both positions address the same military action; one opposes it, one supports it." }, ... ]. No preamble, no markdown.`;

  const user = `${blocks}\n\nOutput only the JSON array.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_completion_tokens: Math.max(2000, pairs.length * 250),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let content = (data?.choices?.[0]?.message?.content ?? "").trim();
  content = content.replace(/^```\w*\n?|\n?```$/g, "").trim();
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return pairs.map(() => ({ relation: "orthogonal" as Relation, alignment: "independent" as Alignment, reasoning: "(parse failed: not array)" }));
    const validRel: Relation[] = ["direct", "indirect", "orthogonal", "none"];
    const validAlign: Alignment[] = ["agree", "conflict", "independent", "unclear"];
    return pairs.map((_, i) => {
      const o = parsed[i] as { relation?: string; alignment?: string; reasoning?: string; rationale?: string } | undefined;
      let rel = (validRel.includes((o?.relation ?? "") as Relation) ? o?.relation : "orthogonal") as Relation;
      let align = (validAlign.includes((o?.alignment ?? "") as Alignment) ? o?.alignment : "independent") as Alignment;
      if ((rel === "orthogonal" || rel === "none") && (align === "agree" || align === "conflict")) {
        align = "independent";
      }
      const reasoningRaw = typeof o?.reasoning === "string" ? o.reasoning : typeof o?.rationale === "string" ? o.rationale : undefined;
      const reasoning = reasoningRaw?.trim().slice(0, 500) || undefined;
      return { relation: rel, alignment: align, reasoning };
    });
  } catch {
    return pairs.map(() => ({ relation: "orthogonal" as Relation, alignment: "independent" as Alignment, reasoning: "(parse failed)" }));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

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
    /* use defaults */
  }
  const maxPositions = clampInt(body.max_positions, 1, 50, MAX_POSITIONS_PER_RUN);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: positions } = await supabase
    .from("canonical_positions")
    .select("canonical_position_id, canonical_text, embedding, primary_topic_id")
    .not("embedding", "is", null)
    .not("primary_topic_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(maxPositions);

  const posList = (Array.isArray(positions) ? positions : []).filter(
    (p): p is { canonical_position_id: string; canonical_text: string | null; embedding: unknown; primary_topic_id: string } =>
      typeof p === "object" && p !== null && typeof (p as { canonical_position_id: unknown }).canonical_position_id === "string"
  );

  const { data: overlapRaw } = await supabase
    .from("position_subtopics")
    .select("canonical_position_id, subtopic_id")
    .in("rank", [1, 2, 3]);

  const posSubtopics = new Map<string, Set<string>>();
  for (const r of Array.isArray(overlapRaw) ? overlapRaw : []) {
    const pid = (r as { canonical_position_id: string; subtopic_id: string }).canonical_position_id;
    const sid = (r as { canonical_position_id: string; subtopic_id: string }).subtopic_id;
    if (!posSubtopics.has(pid)) posSubtopics.set(pid, new Set());
    posSubtopics.get(pid)!.add(sid);
  }

  if (posList.length === 0) {
    return json({ ok: true, positions_processed: 0, pairs_classified: 0, message: "No positions with topic", dry_run: dryRun });
  }

  type PendingPair = { a: string; b: string; textA: string; textB: string };
  const pairKeys = new Set<string>();
  const pendingPairs: PendingPair[] = [];

  for (const pos of posList) {
    const embStr = parseEmbedding(pos.embedding);
    if (!embStr || !pos.primary_topic_id) continue;

    const { data: knnRows } = await supabase.rpc("match_positions_nearest_in_topic", {
      query_embedding: embStr,
      topic_id: pos.primary_topic_id,
      match_count: K + 1,
    });

    const knn = (Array.isArray(knnRows) ? knnRows : []) as Array<{ canonical_position_id: string; distance: number }>;
    const streamA = knn.filter((m) => m.canonical_position_id !== pos.canonical_position_id).slice(0, K);

    const mySubs = posSubtopics.get(pos.canonical_position_id);
    for (const nb of streamA) {
      const nbSubs = posSubtopics.get(nb.canonical_position_id);
      if (!mySubs || !nbSubs || ![...mySubs].some((s) => nbSubs.has(s))) continue;

      const [a, b] = pos.canonical_position_id < nb.canonical_position_id
        ? [pos.canonical_position_id, nb.canonical_position_id]
        : [nb.canonical_position_id, pos.canonical_position_id];
      const key = `${a}|${b}`;
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);

      const { data: existing } = await supabase
        .from("position_relationships")
        .select("position_a_id")
        .eq("position_a_id", a)
        .eq("position_b_id", b)
        .maybeSingle();
      if (existing) continue;

      const textForPos = (pos.canonical_text ?? "").trim().slice(0, 400);
      let textA: string;
      let textB: string;
      if (a === pos.canonical_position_id) {
        textA = textForPos;
        const { data: bRow } = await supabase.from("canonical_positions").select("canonical_text").eq("canonical_position_id", b).single();
        textB = ((bRow as { canonical_text?: string } | null)?.canonical_text ?? "").trim().slice(0, 400);
      } else {
        const { data: aRow } = await supabase.from("canonical_positions").select("canonical_text").eq("canonical_position_id", a).single();
        textA = ((aRow as { canonical_text?: string } | null)?.canonical_text ?? "").trim().slice(0, 400);
        textB = textForPos;
      }
      pendingPairs.push({ a, b, textA, textB });
    }

    if (mySubs && mySubs.size > 0) {
      const othersInTopic = posList.filter(
        (p) => p.canonical_position_id !== pos.canonical_position_id && p.primary_topic_id === pos.primary_topic_id
      );
      for (const other of othersInTopic) {
        const otherSubs = posSubtopics.get(other.canonical_position_id);
        if (!otherSubs) continue;
        const overlap = [...mySubs].some((s) => otherSubs.has(s));
        if (!overlap) continue;

        const [a, b] = pos.canonical_position_id < other.canonical_position_id
          ? [pos.canonical_position_id, other.canonical_position_id]
          : [other.canonical_position_id, pos.canonical_position_id];
        const key = `${a}|${b}`;
        if (pairKeys.has(key)) continue;
        pairKeys.add(key);

        const { data: ex } = await supabase
          .from("position_relationships")
          .select("position_a_id")
          .eq("position_a_id", a)
          .eq("position_b_id", b)
          .maybeSingle();
        if (ex) continue;

        const textA = ((a === pos.canonical_position_id ? pos.canonical_text : other.canonical_text) ?? "").trim().slice(0, 400);
        const textB = ((b === pos.canonical_position_id ? pos.canonical_text : other.canonical_text) ?? "").trim().slice(0, 400);
        pendingPairs.push({ a, b, textA, textB });
      }
    }
  }

  const toProcess = pendingPairs.slice(0, MAX_PAIRS_PER_RUN);
  const positionIds = [...new Set(toProcess.flatMap((p) => [p.a, p.b]))];

  const contextByPosition = new Map<string, { title: string; published_at: string | null }>();
  if (positionIds.length > 0) {
    const { data: spRows } = await supabase
      .from("story_positions")
      .select("canonical_position_id, stories(title, published_at, created_at)")
      .in("canonical_position_id", positionIds)
      .not("canonical_position_id", "is", null);

    const rows = (Array.isArray(spRows) ? spRows : []) as Array<{
      canonical_position_id: string;
      stories: { title?: string; published_at?: string | null; created_at?: string | null } | null;
    }>;
    const withDate = rows
      .filter((r) => r.stories)
      .map((r) => ({
        canonical_position_id: r.canonical_position_id,
        title: (r.stories?.title ?? "").trim().slice(0, 80) || "(no title)",
        published_at: r.stories?.published_at ?? null,
        sortKey: r.stories?.published_at ?? r.stories?.created_at ?? "",
      }))
      .sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""));
    for (const row of withDate) {
      if (!contextByPosition.has(row.canonical_position_id)) {
        contextByPosition.set(row.canonical_position_id, { title: row.title, published_at: row.published_at });
      }
    }
  }

  const batches: Array<typeof toProcess> = [];
  for (let i = 0; i < toProcess.length; i += PAIRS_PER_BATCH) {
    batches.push(toProcess.slice(i, i + PAIRS_PER_BATCH));
  }

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      try {
        const results = await classifyBatch(
          OPENAI_API_KEY,
          MODEL,
          batch.map((p) => ({
            textA: p.textA,
            textB: p.textB,
            contextA: contextByPosition.get(p.a),
            contextB: contextByPosition.get(p.b),
          }))
        );
        for (let j = 0; j < batch.length; j++) {
          const p = batch[j];
          const r = results[j];
          console.log(
            `[classify] "${(p.textA ?? "").slice(0, 60)}..." vs "${(p.textB ?? "").slice(0, 60)}..." → ${r.relation}/${r.alignment} | ${r.reasoning ?? "(no reasoning)"}`
          );
        }
        return { batch, results };
      } catch (e) {
        console.error("[classify_position_pairs] LLM batch:", e);
        return {
          batch,
          results: batch.map(() => ({ relation: "orthogonal" as Relation, alignment: "independent" as Alignment, reasoning: "(LLM error)" })),
        };
      }
    })
  );

  if (!dryRun) {
    for (const { batch, results } of batchResults) {
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const r = results[j];
        await supabase.from("position_relationships").upsert(
          {
            position_a_id: p.a,
            position_b_id: p.b,
            relation: r.relation,
            alignment: r.alignment,
            classified_at: new Date().toISOString(),
            confidence: 0.8,
            model: MODEL,
            rationale: r.reasoning ?? null,
          },
          { onConflict: "position_a_id,position_b_id" }
        );
      }
    }
  }

  const pairsClassified = batchResults.reduce((sum, { batch }) => sum + batch.length, 0);

  const response: Record<string, unknown> = {
    ok: true,
    positions_processed: posList.length,
    pairs_to_classify: pendingPairs.length,
    pairs_classified: pairsClassified,
    dry_run: dryRun,
  };

  if (dryRun) {
    response.classifications = batchResults.flatMap(({ batch, results }) =>
      batch.map((p, j) => {
        const r = results[j];
        return {
          textA: p.textA,
          textB: p.textB,
          relation: r.relation,
          alignment: r.alignment,
          rationale: r.reasoning ?? null,
        };
      })
    );
  }

  return json(response);
});
