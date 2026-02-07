// Supabase Edge Function: merge chunk extraction_json into story_claims, story_evidence, story_claim_evidence_links.
// Runs after all chunks for a story have extraction_json. Deduplicates, normalizes, consolidates. No orphan evidence.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_stories?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_STORIES = 1;

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

type MergeClaim = {
  raw_text: string;
  polarity: string;
  extraction_confidence: number;
  span_start?: number | null;
  span_end?: number | null;
};

type MergeEvidence = {
  evidence_type: string;
  excerpt: string;
  attribution?: string | null;
  source_ref?: string | null;
  extraction_confidence: number;
};

type MergeLink = {
  claim_index: number;
  evidence_index: number;
  relation_type: string;
  confidence: number;
  rationale?: string | null;
};

async function callMergeLLM(
  apiKey: string,
  model: string,
  storyId: string,
  chunkBlobs: unknown[],
  requestId: string
): Promise<{ claims: MergeClaim[]; evidence: MergeEvidence[]; links: MergeLink[] }> {
  const system = `You merge chunk-level extractions into a single story-level set of claims, evidence, and links for DOXA.

Given multiple chunk extraction blobs (each has claims, evidence, links), your job is to:
1. Deduplicate overlapping claims; normalize wording.
2. Consolidate evidence; merge duplicates.
3. Produce explicit relationships: every evidence item MUST link to at least one claim. Do not output orphan evidence.

Output three arrays: claims, evidence, links. Use 0-based indices. claim_index and evidence_index refer to positions in the output arrays.
polarity: asserts | denies | uncertain. evidence_type: quote | statistic | document_ref | dataset_ref | other. relation_type: supports | contradicts | contextual.

If the merged result has no claims, return empty arrays.`;

  const userPayload = { story_id: storyId, chunk_blobs: chunkBlobs };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doxa_merge_story_claims",
          strict: true,
          schema: {
            type: "object",
            properties: {
              claims: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    raw_text: { type: "string" },
                    polarity: { type: "string", enum: ["asserts", "denies", "uncertain"] },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                    span_start: { type: ["integer", "null"] },
                    span_end: { type: ["integer", "null"] },
                  },
                  required: ["raw_text", "polarity", "extraction_confidence", "span_start", "span_end"],
                  additionalProperties: false,
                },
              },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    evidence_type: { type: "string", enum: ["quote", "statistic", "document_ref", "dataset_ref", "other"] },
                    excerpt: { type: "string" },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                    attribution: { type: ["string", "null"] },
                    source_ref: { type: ["string", "null"] },
                  },
                  required: ["evidence_type", "excerpt", "extraction_confidence", "attribution", "source_ref"],
                  additionalProperties: false,
                },
              },
              links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    claim_index: { type: "integer", minimum: 0 },
                    evidence_index: { type: "integer", minimum: 0 },
                    relation_type: { type: "string", enum: ["supports", "contradicts", "contextual"] },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    rationale: { type: ["string", "null"] },
                  },
                  required: ["claim_index", "evidence_index", "relation_type", "confidence", "rationale"],
                  additionalProperties: false,
                },
              },
            },
            required: ["claims", "evidence", "links"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[merge_story_claims] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(contentStr) as {
    claims?: MergeClaim[];
    evidence?: MergeEvidence[];
    links?: MergeLink[];
  };

  const claims = (Array.isArray(parsed?.claims) ? parsed.claims : []) as MergeClaim[];
  const evidence = (Array.isArray(parsed?.evidence) ? parsed.evidence : []) as MergeEvidence[];
  const links = (Array.isArray(parsed?.links) ? parsed.links : []) as MergeLink[];

  return { claims, evidence, links };
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
    // use defaults
  }
  const maxStories = clampInt(body.max_stories, 1, 5, DEFAULT_MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: allChunkRows } = await supabase.from("story_chunks").select("story_id");
  const chunkStoryIds = [...new Set((allChunkRows ?? []).map((r: { story_id: string }) => r.story_id))];

  const { data: nullChunkRows } = await supabase
    .from("story_chunks")
    .select("story_id")
    .is("extraction_json", null);
  const hasNullChunks = new Set((nullChunkRows ?? []).map((r: { story_id: string }) => r.story_id));

  const { data: claimRows } = await supabase.from("story_claims").select("story_id");
  const hasClaims = new Set((claimRows ?? []).map((r: { story_id: string }) => r.story_id));

  const readyStoryIds = chunkStoryIds.filter(
    (id) => !hasNullChunks.has(id) && !hasClaims.has(id)
  );

  if (readyStoryIds.length === 0) {
    return json({
      ok: true,
      processed: 0,
      story_claims: 0,
      story_evidence: 0,
      story_claim_evidence_links: 0,
      message: "No stories ready to merge",
      dry_run: dryRun,
    });
  }

  const toProcess = readyStoryIds.slice(0, maxStories);
  const requestId = `merge-${Date.now()}`;
  let runId: string | null = null;

  if (!dryRun) {
    try {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "story_merge",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
        })
        .select("run_id")
        .single();
      if (runData?.run_id) runId = runData.run_id;
    } catch (_) {
      // continue
    }
  }

  let processed = 0;
  let totalClaims = 0;
  let totalEvidence = 0;
  let totalLinks = 0;

  for (const storyId of toProcess) {
    const { data: chunks } = await supabase
      .from("story_chunks")
      .select("extraction_json")
      .eq("story_id", storyId)
      .order("chunk_index", { ascending: true });

    const blobs = (chunks ?? [])
      .map((c: { extraction_json: unknown }) => c.extraction_json)
      .filter((b): b is object => b !== null && typeof b === "object");

    if (blobs.length === 0) continue;

    let mergeResult: { claims: MergeClaim[]; evidence: MergeEvidence[]; links: MergeLink[] };
    try {
      mergeResult = await callMergeLLM(OPENAI_API_KEY, MODEL, storyId, blobs, `${requestId}-${storyId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[merge_story_claims] LLM error:", msg);
      if (!dryRun && runId) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
          .eq("run_id", runId);
      }
      return json({ error: msg, story_id: storyId }, 500);
    }

    const { claims: mergeClaims, evidence: mergeEvidence, links: mergeLinks } = mergeResult;

    const evidenceWithLinks = new Set(mergeLinks.map((l) => l.evidence_index));
    const evidenceToKeep = mergeEvidence.filter((_, i) => evidenceWithLinks.has(i));
    const claimIndices = new Set(mergeClaims.map((_, i) => i));
    const validLinks = mergeLinks.filter(
      (l) =>
        claimIndices.has(l.claim_index) &&
        l.evidence_index < mergeEvidence.length &&
        evidenceWithLinks.has(l.evidence_index)
    );

    if (dryRun) {
      totalClaims += mergeClaims.length;
      totalEvidence += evidenceToKeep.length;
      totalLinks += validLinks.length;
      processed += 1;
      continue;
    }

    const evidenceIndexMap = new Map<number, number>();
    mergeEvidence.forEach((_, oldIdx) => {
      if (evidenceWithLinks.has(oldIdx)) {
        evidenceIndexMap.set(oldIdx, evidenceIndexMap.size);
      }
    });

    const claimIds: string[] = [];
    for (const c of mergeClaims) {
      const conf = clampNum(c.extraction_confidence, 0, 1, 0.5);
      const { data: ins } = await supabase
        .from("story_claims")
        .insert({
          story_id: storyId,
          raw_text: (c.raw_text ?? "").trim() || "Unspecified",
          polarity: c.polarity ?? "uncertain",
          extraction_confidence: conf,
          span_start: c.span_start ?? null,
          span_end: c.span_end ?? null,
          run_id: runId,
        })
        .select("story_claim_id")
        .single();
      if (ins?.story_claim_id) claimIds.push(ins.story_claim_id);
    }

    const evidenceIds: string[] = [];
    for (const e of evidenceToKeep) {
      const conf = clampNum(e.extraction_confidence, 0, 1, 0.5);
      const { data: ins } = await supabase
        .from("story_evidence")
        .insert({
          story_id: storyId,
          evidence_type: e.evidence_type ?? "other",
          excerpt: (e.excerpt ?? "").trim() || "Unspecified",
          attribution: e.attribution ?? null,
          source_ref: e.source_ref ?? null,
          extraction_confidence: conf,
          run_id: runId,
        })
        .select("evidence_id")
        .single();
      if (ins?.evidence_id) evidenceIds.push(ins.evidence_id);
    }

    let linksInserted = 0;
    for (const link of validLinks) {
      const newClaimIdx = link.claim_index;
      const newEvidenceIdx = evidenceIndexMap.get(link.evidence_index);
      if (newEvidenceIdx === undefined || newEvidenceIdx >= evidenceIds.length) continue;
      const scId = claimIds[newClaimIdx];
      const evId = evidenceIds[newEvidenceIdx];
      if (!scId || !evId) continue;
      const conf = clampNum(link.confidence, 0, 1, 0.5);
      await supabase.from("story_claim_evidence_links").insert({
        story_claim_id: scId,
        evidence_id: evId,
        relation_type: link.relation_type ?? "contextual",
        confidence: conf,
        rationale: link.rationale ?? null,
        run_id: runId,
      });
      linksInserted += 1;
    }

    totalClaims += claimIds.length;
    totalEvidence += evidenceIds.length;
    totalLinks += linksInserted;

    const isEmpty = claimIds.length === 0 && evidenceIds.length === 0;
    await supabase
      .from("stories")
      .update({
        extraction_completed_at: isEmpty ? null : new Date().toISOString(),
        extraction_skipped_empty: isEmpty,
      })
      .eq("story_id", storyId);

    processed += 1;
  }

  if (!dryRun && runId) {
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        counts: { stories: processed },
      })
      .eq("run_id", runId);
  }

  return json({
    ok: true,
    processed,
    story_claims: totalClaims,
    story_evidence: totalEvidence,
    story_claim_evidence_links: totalLinks,
    model: MODEL,
    run_id: runId,
    dry_run: dryRun,
  });
});
