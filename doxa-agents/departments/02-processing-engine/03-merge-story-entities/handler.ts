// Supabase Edge Function: merge chunk extraction_json into story_claims, story_evidence, story_positions, story_events, and bridge tables.
// Positions and events are extracted in 02-extract-story-entities; this step merges them to story-level rows, then invokes canonical linkers.
// Runs after all chunks for a story have extraction_json. Deduplicates, normalizes, consolidates. No orphan evidence.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_stories?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";

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
  stance?: string;
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

type MergePosition = {
  raw_text: string;
  extraction_confidence: number;
  excerpt_text: string;
  cue_phrases: string[];
  speaker_type: "narrator" | "quoted" | "critics" | "supporters" | null;
};

type MergePositionClaimLink = { position_index: number; claim_index: number };
type MergePositionEvidenceLink = { position_index: number; evidence_index: number };

type MergeEvent = {
  event_summary: string;
  primary_actor?: string | null;
  action?: string | null;
  object?: string | null;
  event_date?: string | null;
  event_timeframe_start?: string | null;
  event_timeframe_end?: string | null;
  location?: string | null;
  event_type?: string | null;
  extraction_confidence: number;
};

type MergeEventEvidenceLink = { event_index: number; evidence_index: number };
type MergeEventClaimLink = { event_index: number; claim_index: number; relation_type: string };

function normalizeChunkBlob(blob: Record<string, unknown>): Record<string, unknown> {
  return {
    ...blob,
    claim_evidence_links: blob.claim_evidence_links ?? blob.links ?? [],
    event_claim_links: blob.event_claim_links ?? [],
  };
}

function parseDateOnly(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

async function callMergeLLM(
  apiKey: string,
  model: string,
  storyId: string,
  chunkBlobs: unknown[],
  requestId: string
): Promise<{
  claims: MergeClaim[];
  evidence: MergeEvidence[];
  claim_evidence_links: MergeLink[];
  positions: MergePosition[];
  position_claim_links: MergePositionClaimLink[];
  position_evidence_links: MergePositionEvidenceLink[];
  events: MergeEvent[];
  event_evidence_links: MergeEventEvidenceLink[];
  event_claim_links: MergeEventClaimLink[];
}> {
  const system = `You merge chunk-level extractions into a single story-level set of claims, evidence, claim_evidence_links, positions, and events for DOXA.

Given multiple chunk extraction blobs (each has claims, evidence, claim_evidence_links, positions, position_claim_links, position_evidence_links, events, event_evidence_links, event_claim_links), your job is to:
1) Deduplicate overlapping claims; normalize wording; keep the most specific, best-anchored version.
2) Consolidate evidence; merge duplicates; keep the most direct sourcing.
3) Produce explicit relationships: evidence must link to at least one output claim OR at least one output event. Do NOT output orphan evidence. Do NOT force links.

CLAIM RULES (same standard as chunk extraction; fail-closed):
A merged claim must be self-contained and anchored:
- Scope/Entity anchor is explicit (no vague referents).
- Time anchor is explicit and non-invented:
  - point-in-time: "As of <Month YYYY> …"
  - period-bound: "During <time period / election cycle / years> …"
  - ongoing evaluation: attributed evaluation + basis derived from evidence that exists in the merged evidence set.
If you cannot preserve anchors without inventing details, DROP the claim.

NORMALIZATION RULES:
- Prefer specificity: choose the version with clearer entity/jurisdiction and clearer timeframe.
- If two claims differ only slightly, merge to the clearest wording.
- If two claims genuinely conflict, keep both as separate claims and set polarity appropriately (asserts/denies/uncertain) based on wording.

EVIDENCE RULES:
- Merge duplicates (same quote/stat/doc ref) across chunks.
- Keep evidence atomic.
- Omit any evidence that cannot be clearly linked to at least one remaining claim or event.

CLAIM_EVIDENCE_LINK RULES:
- Create claim_evidence_links only when the evidence clearly supports/contradicts/contextualizes.
- Do not "attach" evidence to a claim just to avoid orphaning; instead omit the evidence.

POSITION MERGE RULES:
- Deduplicate overlapping positions across chunks; keep the clearest wording with excerpt_text and cue_phrases.
- Preserve position_claim_links and position_evidence_links using indices into the merged claims and evidence arrays.
- If a merged position lacks cue_phrases (empty array) or extraction_confidence < 0.6, OMIT it.
- speaker_type: narrator | quoted | critics | supporters | null.
- Reindex positions after merge; position_claim_links and position_evidence_links use 0-based indices into output arrays.

EVENT MERGE RULES:
- Deduplicate overlapping events across chunks; prefer the most specific date, actor, and action.
- Each event needs event_summary (self-contained), primary_actor, action, object, dates/timeframes, location, event_type as available.
- EVENT vs CLAIM: keep occurrences as events; keep assertions/evaluations/denials about them as claims.
- If extraction_confidence < 0.6 or no event_evidence_links, OMIT the event.
- event_evidence_links: { event_index, evidence_index } required for each output event.
- event_claim_links: { event_index, claim_index, relation_type } with relation_type: about | describes | disputes | causes.
- Preserve event_claim_links from chunk blobs when the linked claim and event survive merge; reindex to merged output arrays. Do not invent new event_claim_links without chunk support.
- Reindex events after merge; all event_*_links use 0-based indices into output arrays.
- Do NOT output event_position_links.

STANCE MERGE RULES (when merging claims across chunks):
- If any chunk has stance=oppose with extraction_confidence >= 0.7, output oppose (do not average it away).
- If any chunk has stance=support with extraction_confidence >= 0.7 and no oppose signal, output support.
- If chunks conflict (e.g. support vs oppose), or if no clear signal, output neutral.
- Treat missing stance in chunk blobs as neutral when merging.
- Otherwise, use the dominant stance weighted by extraction_confidence.

OUTPUT:
Output nine arrays: claims, evidence, claim_evidence_links, positions, position_claim_links, position_evidence_links, events, event_evidence_links, event_claim_links. Use 0-based indices.
polarity: asserts | denies | uncertain. stance: support | oppose | neutral. evidence_type: quote | statistic | document_ref | dataset_ref | other. relation_type (claim-evidence): supports | contradicts | contextual. speaker_type: narrator | quoted | critics | supporters | null.

ROLE-MODEL CLAIMS (style examples; do not copy unless supported by merged content):
- "As of February 2026, there is no clear Democratic frontrunner in the North Carolina governor's race."
- "During the 2026 election cycle, early polling in <state/race> shows <candidate/party> leading, according to <poll named in evidence>."
- "Critics argue that <policy> is harmful based on <specific stated basis>."

If the merged result has no valid anchored claims, return empty arrays.
Return JSON only. Do not add any additional top-level keys.`;

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
          name: "doxa_merge_story_entities",
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
                    stance: { type: "string", enum: ["support", "oppose", "neutral"] },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                    span_start: { type: ["integer", "null"] },
                    span_end: { type: ["integer", "null"] },
                  },
                  required: ["raw_text", "polarity", "stance", "extraction_confidence", "span_start", "span_end"],
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
              claim_evidence_links: {
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
              positions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    raw_text: { type: "string" },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                    excerpt_text: { type: "string" },
                    cue_phrases: { type: "array", items: { type: "string" } },
                    speaker_type: { type: ["string", "null"], enum: ["narrator", "quoted", "critics", "supporters", null] },
                  },
                  required: ["raw_text", "extraction_confidence", "excerpt_text", "cue_phrases", "speaker_type"],
                  additionalProperties: false,
                },
              },
              position_claim_links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    position_index: { type: "integer", minimum: 0 },
                    claim_index: { type: "integer", minimum: 0 },
                  },
                  required: ["position_index", "claim_index"],
                  additionalProperties: false,
                },
              },
              position_evidence_links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    position_index: { type: "integer", minimum: 0 },
                    evidence_index: { type: "integer", minimum: 0 },
                  },
                  required: ["position_index", "evidence_index"],
                  additionalProperties: false,
                },
              },
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    event_summary: { type: "string" },
                    primary_actor: { type: ["string", "null"] },
                    action: { type: ["string", "null"] },
                    object: { type: ["string", "null"] },
                    event_date: { type: ["string", "null"] },
                    event_timeframe_start: { type: ["string", "null"] },
                    event_timeframe_end: { type: ["string", "null"] },
                    location: { type: ["string", "null"] },
                    event_type: { type: ["string", "null"] },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: [
                    "event_summary",
                    "primary_actor",
                    "action",
                    "object",
                    "event_date",
                    "event_timeframe_start",
                    "event_timeframe_end",
                    "location",
                    "event_type",
                    "extraction_confidence",
                  ],
                  additionalProperties: false,
                },
              },
              event_evidence_links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    event_index: { type: "integer", minimum: 0 },
                    evidence_index: { type: "integer", minimum: 0 },
                  },
                  required: ["event_index", "evidence_index"],
                  additionalProperties: false,
                },
              },
              event_claim_links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    event_index: { type: "integer", minimum: 0 },
                    claim_index: { type: "integer", minimum: 0 },
                    relation_type: { type: "string", enum: ["about", "describes", "disputes", "causes"] },
                  },
                  required: ["event_index", "claim_index", "relation_type"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "claims",
              "evidence",
              "claim_evidence_links",
              "positions",
              "position_claim_links",
              "position_evidence_links",
              "events",
              "event_evidence_links",
              "event_claim_links",
            ],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[merge_story_entities] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(contentStr) as {
    claims?: MergeClaim[];
    evidence?: MergeEvidence[];
    claim_evidence_links?: MergeLink[];
    links?: MergeLink[];
    positions?: MergePosition[];
    position_claim_links?: MergePositionClaimLink[];
    position_evidence_links?: MergePositionEvidenceLink[];
    events?: MergeEvent[];
    event_evidence_links?: MergeEventEvidenceLink[];
    event_claim_links?: MergeEventClaimLink[];
  };

  const claims = (Array.isArray(parsed?.claims) ? parsed.claims : []) as MergeClaim[];
  const evidence = (Array.isArray(parsed?.evidence) ? parsed.evidence : []) as MergeEvidence[];
  const claim_evidence_links = (
    Array.isArray(parsed?.claim_evidence_links)
      ? parsed.claim_evidence_links
      : Array.isArray(parsed?.links)
        ? parsed.links
        : []
  ) as MergeLink[];
  const positionsRaw = (Array.isArray(parsed?.positions) ? parsed.positions : []) as MergePosition[];
  const positions = positionsRaw.filter(
    (p) =>
      p.extraction_confidence >= 0.6 &&
      Array.isArray(p.cue_phrases) &&
      p.cue_phrases.length > 0
  );
  const posIndexMap = new Map<number, number>();
  let newIdx = 0;
  for (let i = 0; i < positionsRaw.length; i++) {
    const p = positionsRaw[i];
    if (p?.extraction_confidence >= 0.6 && Array.isArray(p?.cue_phrases) && p.cue_phrases.length > 0) {
      posIndexMap.set(i, newIdx++);
    }
  }
  const position_claim_links = (Array.isArray(parsed?.position_claim_links) ? parsed.position_claim_links : [])
    .filter((l) => posIndexMap.has(l?.position_index ?? -1))
    .map((l) => ({
      position_index: posIndexMap.get(l!.position_index)!,
      claim_index: l!.claim_index ?? 0,
    }));
  const position_evidence_links = (Array.isArray(parsed?.position_evidence_links) ? parsed.position_evidence_links : [])
    .filter((l) => posIndexMap.has(l?.position_index ?? -1))
    .map((l) => ({
      position_index: posIndexMap.get(l!.position_index)!,
      evidence_index: l!.evidence_index ?? 0,
    }));

  const eventsRaw = (Array.isArray(parsed?.events) ? parsed.events : []) as MergeEvent[];
  const eventEvidenceRaw = Array.isArray(parsed?.event_evidence_links) ? parsed.event_evidence_links : [];
  const eventsWithEvidence = new Set(eventEvidenceRaw.map((l) => l?.event_index ?? -1));
  const eventIndexMap = new Map<number, number>();
  let eventNewIdx = 0;
  for (let i = 0; i < eventsRaw.length; i++) {
    const e = eventsRaw[i];
    if (e?.extraction_confidence >= 0.6 && eventsWithEvidence.has(i)) {
      eventIndexMap.set(i, eventNewIdx++);
    }
  }
  const events = eventsRaw.filter((_, i) => eventIndexMap.has(i));
  const event_evidence_links = eventEvidenceRaw
    .filter((l) => eventIndexMap.has(l?.event_index ?? -1))
    .map((l) => ({
      event_index: eventIndexMap.get(l!.event_index)!,
      evidence_index: l!.evidence_index ?? 0,
    }));
  const event_claim_links = (Array.isArray(parsed?.event_claim_links) ? parsed.event_claim_links : [])
    .filter((l) => eventIndexMap.has(l?.event_index ?? -1))
    .map((l) => ({
      event_index: eventIndexMap.get(l!.event_index)!,
      claim_index: l!.claim_index ?? 0,
      relation_type: l!.relation_type ?? "about",
    }));

  return {
    claims,
    evidence,
    claim_evidence_links,
    positions,
    position_claim_links,
    position_evidence_links,
    events,
    event_evidence_links,
    event_claim_links,
  };
}

export const handler = async (req: Request) => {
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
  const { id: singleStoryId, invalid: invalidStoryId } = parseStoryIdFromBody(body);
  if (invalidStoryId) return json({ error: invalidUuidMessage("story_id") }, 400);

  const maxStories = clampInt(body.max_stories, 1, 5, DEFAULT_MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let toProcess: string[] = [];

  if (singleStoryId) {
    const { data: storyRow, error: storyErr } = await supabase
      .from("stories")
      .select("story_id")
      .eq("story_id", singleStoryId)
      .maybeSingle();
    if (storyErr) {
      console.error("[merge_story_entities] story fetch error:", storyErr.message);
      return json({ error: storyErr.message }, 500);
    }
    if (!storyRow) {
      return json({ error: "Story not found", story_id: singleStoryId }, 404);
    }
    toProcess = [singleStoryId];
  } else {
    const { data: readyRaw, error: rpcErr } = await supabase.rpc("get_stories_ready_to_merge", {
      p_limit: maxStories,
    });

    if (rpcErr) {
      console.error("[merge_story_entities] get_stories_ready_to_merge error:", rpcErr.message);
      return json({ error: rpcErr.message }, 500);
    }

    toProcess = (Array.isArray(readyRaw) ? readyRaw : [])
      .map((r: { story_id?: string }) => r?.story_id)
      .filter((id): id is string => typeof id === "string");
  }

  if (toProcess.length === 0) {
    return json({
      ok: true,
      processed: 0,
      story_claims: 0,
      story_evidence: 0,
      story_claim_evidence_links: 0,
      story_positions: 0,
      story_events: 0,
      message: "No stories ready to merge",
      dry_run: dryRun,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }
  const requestId = `merge-${Date.now()}`;
  let runId: string | null = null;

  if (!dryRun) {
    try {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "merge_story_entities",
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
  let totalPositions = 0;
  let totalEvents = 0;

  for (const storyId of toProcess) {
    const { data: chunks } = await supabase
      .from("story_chunks")
      .select("extraction_json")
      .eq("story_id", storyId)
      .order("chunk_index", { ascending: true });

    const blobs = (chunks ?? [])
      .map((c: { extraction_json: unknown }) => c.extraction_json)
      .filter((b): b is Record<string, unknown> => b !== null && typeof b === "object" && !Array.isArray(b))
      .map(normalizeChunkBlob);

    if (blobs.length === 0) continue;

    let mergeResult: {
      claims: MergeClaim[];
      evidence: MergeEvidence[];
      claim_evidence_links: MergeLink[];
      positions: MergePosition[];
      position_claim_links: MergePositionClaimLink[];
      position_evidence_links: MergePositionEvidenceLink[];
      events: MergeEvent[];
      event_evidence_links: MergeEventEvidenceLink[];
      event_claim_links: MergeEventClaimLink[];
    };
    try {
      mergeResult = await callMergeLLM(OPENAI_API_KEY, MODEL, storyId, blobs, `${requestId}-${storyId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[merge_story_entities] LLM error:", msg);
      if (!dryRun && runId) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
          .eq("run_id", runId);
      }
      return json({ error: msg, story_id: storyId }, 500);
    }

    const {
      claims: mergeClaims,
      evidence: mergeEvidence,
      claim_evidence_links: mergeClaimEvidenceLinks,
      positions: mergePositions,
      position_claim_links: mergePositionClaimLinks,
      position_evidence_links: mergePositionEvidenceLinks,
      events: mergeEvents,
      event_evidence_links: mergeEventEvidenceLinks,
      event_claim_links: mergeEventClaimLinks,
    } = mergeResult;

    const evidenceWithLinks = new Set([
      ...mergeClaimEvidenceLinks.map((l) => l.evidence_index),
      ...mergeEventEvidenceLinks.map((l) => l.evidence_index),
    ]);
    const evidenceToKeep = mergeEvidence.filter((_, i) => evidenceWithLinks.has(i));
    const claimIndices = new Set(mergeClaims.map((_, i) => i));
    const validLinks = mergeClaimEvidenceLinks.filter(
      (l) =>
        claimIndices.has(l.claim_index) &&
        l.evidence_index < mergeEvidence.length &&
        evidenceWithLinks.has(l.evidence_index)
    );

    if (dryRun) {
      totalClaims += mergeClaims.length;
      totalEvidence += evidenceToKeep.length;
      totalLinks += validLinks.length;
      totalPositions += mergePositions.length;
      totalEvents += mergeEvents.length;
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
      const stanceVal =
        c.stance && ["support", "oppose", "neutral"].includes(c.stance) ? c.stance : null;
      const { data: ins } = await supabase
        .from("story_claims")
        .insert({
          story_id: storyId,
          raw_text: (c.raw_text ?? "").trim() || "Unspecified",
          polarity: c.polarity ?? "uncertain",
          stance: stanceVal,
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

    const positionIds: string[] = [];
    for (const p of mergePositions) {
      const conf = clampNum(p.extraction_confidence, 0, 1, 0.5);
      const { data: posIns } = await supabase
        .from("story_positions")
        .insert({
          story_id: storyId,
          raw_text: (p.raw_text ?? "").trim() || "Unspecified",
          extraction_confidence: conf,
          excerpt_text: (p.excerpt_text ?? "").trim() || "",
          cue_phrases: Array.isArray(p.cue_phrases) ? p.cue_phrases : [],
          speaker_type: p.speaker_type ?? null,
          run_id: runId,
        })
        .select("story_position_id")
        .single();
      if (posIns?.story_position_id) positionIds.push(posIns.story_position_id);
    }

    for (const l of mergePositionClaimLinks) {
      if (l.position_index >= positionIds.length || l.claim_index >= claimIds.length) continue;
      const spId = positionIds[l.position_index];
      const scId = claimIds[l.claim_index];
      if (!spId || !scId) continue;
      await supabase.from("story_position_claim_links").insert({
        story_position_id: spId,
        story_claim_id: scId,
      });
    }

    for (const l of mergePositionEvidenceLinks) {
      if (l.position_index >= positionIds.length) continue;
      const newEvIdx = evidenceIndexMap.get(l.evidence_index);
      if (newEvIdx === undefined || newEvIdx >= evidenceIds.length) continue;
      const spId = positionIds[l.position_index];
      const evId = evidenceIds[newEvIdx];
      if (!spId || !evId) continue;
      await supabase.from("story_position_evidence_links").insert({
        story_position_id: spId,
        evidence_id: evId,
      });
    }

    const eventIds: string[] = [];
    for (const ev of mergeEvents) {
      const conf = clampNum(ev.extraction_confidence, 0, 1, 0.5);
      const { data: evIns } = await supabase
        .from("story_events")
        .insert({
          story_id: storyId,
          event_summary: (ev.event_summary ?? "").trim() || "Unspecified",
          extraction_confidence: conf,
          primary_actor: ev.primary_actor ?? null,
          action: ev.action ?? null,
          object: ev.object ?? null,
          event_date: parseDateOnly(ev.event_date),
          event_timeframe_start: parseDateOnly(ev.event_timeframe_start),
          event_timeframe_end: parseDateOnly(ev.event_timeframe_end),
          location: ev.location ?? null,
          event_type: ev.event_type ?? null,
          run_id: runId,
        })
        .select("story_event_id")
        .single();
      if (evIns?.story_event_id) eventIds.push(evIns.story_event_id);
    }

    for (const l of mergeEventEvidenceLinks) {
      if (l.event_index >= eventIds.length) continue;
      const newEvIdx = evidenceIndexMap.get(l.evidence_index);
      if (newEvIdx === undefined || newEvIdx >= evidenceIds.length) continue;
      const seId = eventIds[l.event_index];
      const evId = evidenceIds[newEvIdx];
      if (!seId || !evId) continue;
      await supabase.from("story_event_evidence_links").insert({
        story_event_id: seId,
        evidence_id: evId,
      });
    }

    const validEventClaimRels = ["about", "describes", "disputes", "causes"] as const;
    for (const l of mergeEventClaimLinks) {
      if (l.event_index >= eventIds.length || l.claim_index >= claimIds.length) continue;
      const rel = validEventClaimRels.includes(l.relation_type as (typeof validEventClaimRels)[number])
        ? l.relation_type
        : "about";
      const seId = eventIds[l.event_index];
      const scId = claimIds[l.claim_index];
      if (!seId || !scId) continue;
      await supabase.from("story_event_claim_links").insert({
        story_event_id: seId,
        story_claim_id: scId,
        relation_type: rel,
      });
    }

    totalClaims += claimIds.length;
    totalEvidence += evidenceIds.length;
    totalLinks += linksInserted;
    totalPositions += positionIds.length;
    totalEvents += eventIds.length;

    const isEmpty =
      claimIds.length === 0 &&
      evidenceIds.length === 0 &&
      positionIds.length === 0 &&
      eventIds.length === 0;
    const now = new Date().toISOString();
    await supabase
      .from("stories")
      .update({
        extraction_completed_at: isEmpty ? null : now,
        extraction_skipped_empty: isEmpty,
        merged_at: now,
        extraction_qa_status: "pending",
        extraction_qa_review_report: null,
        extraction_qa_validation_report: null,
        extraction_qa_refinement_count: 0,
        extraction_qa_validated_at: null,
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
    story_positions: totalPositions,
    story_events: totalEvents,
    model: MODEL,
    run_id: runId,
    dry_run: dryRun,
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
