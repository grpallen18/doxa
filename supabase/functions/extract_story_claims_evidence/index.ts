// Supabase Edge Function: extract claims and evidence from KEEP stories (one story per run).
// Uses final_content = longest of content_full, scraped_content, content_snippet (no URL scraping; run scrape_story_content first).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY; optional OPENAI_MODEL (same as relevance_gate).
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";

type StoryRow = {
  story_id: string;
  title: string | null;
  content_snippet: string | null;
  content_full: string | null;
  scraped_content: string | null;
  url: string | null;
  created_at: string | null;
  sources: { name: string } | null;
};

type LlmClaim = {
  raw_text: string;
  polarity: string;
  extraction_confidence: number;
  span_start?: number;
  span_end?: number;
};

type LlmEvidence = {
  evidence_type: string;
  excerpt: string;
  attribution?: string;
  source_ref?: string;
  extraction_confidence: number;
  metadata?: Record<string, unknown>;
};

type LlmLink = {
  claim_index: number;
  evidence_index: number;
  relation_type: string;
  confidence: number;
  rationale?: string;
};

type ChunkResult = {
  claims: LlmClaim[];
  evidence: LlmEvidence[];
  links: LlmLink[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-5-nano-2025-08-07";
const MAX_STORIES = 1;
const CHUNK_SIZE = 3500;
const CHUNK_OVERLAP = 500;

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

function getSourceName(sources: unknown): string {
  if (sources === null || sources === undefined) return "";
  if (typeof sources === "object" && !Array.isArray(sources) && "name" in sources) {
    const name = (sources as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

function normalizeClaim(d: unknown): LlmClaim | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const raw_text = typeof o.raw_text === "string" ? o.raw_text.trim() : "";
  if (!raw_text) return null;
  const polarity = typeof o.polarity === "string" ? o.polarity : "uncertain";
  const extraction_confidence = clampNum(o.extraction_confidence, 0, 1, 0.5);
  const span_start = typeof o.span_start === "number" ? o.span_start : undefined;
  const span_end = typeof o.span_end === "number" ? o.span_end : undefined;
  return { raw_text, polarity, extraction_confidence, span_start, span_end };
}

function normalizeEvidence(d: unknown): LlmEvidence | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const evidence_type = typeof o.evidence_type === "string" ? o.evidence_type : "other";
  const excerpt = typeof o.excerpt === "string" ? o.excerpt.trim() : "";
  if (!excerpt) return null;
  const extraction_confidence = clampNum(o.extraction_confidence, 0, 1, 0.5);
  const attribution = typeof o.attribution === "string" ? o.attribution.trim() : undefined;
  const source_ref = typeof o.source_ref === "string" ? o.source_ref.trim() : undefined;
  const metadata = o.metadata && typeof o.metadata === "object" && !Array.isArray(o.metadata) ? (o.metadata as Record<string, unknown>) : undefined;
  return { evidence_type, excerpt, attribution, source_ref, extraction_confidence, metadata };
}

function normalizeLink(d: unknown, maxClaim: number, maxEvidence: number): LlmLink | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const claim_index = clampInt(o.claim_index, 0, maxClaim, -1);
  const evidence_index = clampInt(o.evidence_index, 0, maxEvidence, -1);
  if (claim_index < 0 || evidence_index < 0) return null;
  const relation_type = typeof o.relation_type === "string" ? o.relation_type : "contextual";
  const confidence = clampNum(o.confidence, 0, 1, 0.5);
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : undefined;
  return { claim_index, evidence_index, relation_type, confidence, rationale };
}

async function callOpenAIChunk(
  apiKey: string,
  model: string,
  storyId: string,
  title: string,
  source: string,
  url: string,
  contentChunk: string,
  requestId: string
): Promise<ChunkResult> {
  const system = `You extract claims and supporting/contradicting evidence from a news story for DOXA.
You are given one story (or a segment of a long story). Do not browse the web.

Claims: distinct factual or normative assertions (asserts | denies | uncertain). raw_text is the exact or paraphrased claim. extraction_confidence 0-1.
Evidence: quotes, statistics, document refs, dataset refs (evidence_type: quote | statistic | document_ref | dataset_ref | other). excerpt is the supporting text. attribution/source_ref if available.
Links: which evidence supports/contradicts/contextualizes which claim. claim_index and evidence_index are 0-based into the claims and evidence arrays in THIS response. relation_type: supports | contradicts | contextual. confidence 0-1.

Return JSON only in the required schema. If there are no claims or no evidence in this segment, return empty arrays.`;

  const userPayload = {
    story_id: storyId,
    title,
    source,
    url,
    content_or_segment: contentChunk,
  };

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
          name: "doxa_extract_claims_evidence",
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
                    metadata: { type: ["object", "null"], additionalProperties: false },
                  },
                  required: ["evidence_type", "excerpt", "extraction_confidence", "attribution", "source_ref", "metadata"],
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
    console.error(`[extract_story_claims_evidence] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) {
    const msg = data.error.message ?? "OpenAI error";
    throw new Error(msg);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Missing OpenAI content");

  let parsed: { claims?: unknown[]; evidence?: unknown[]; links?: unknown[] };
  try {
    parsed = JSON.parse(content) as { claims?: unknown[]; evidence?: unknown[]; links?: unknown[] };
  } catch {
    throw new Error("OpenAI content was not valid JSON");
  }

  const claims = (Array.isArray(parsed?.claims) ? parsed.claims : [])
    .map(normalizeClaim)
    .filter((c): c is LlmClaim => c !== null);
  const evidence = (Array.isArray(parsed?.evidence) ? parsed.evidence : [])
    .map(normalizeEvidence)
    .filter((e): e is LlmEvidence => e !== null);
  const maxClaim = Math.max(0, claims.length - 1);
  const maxEvidence = Math.max(0, evidence.length - 1);
  const links = (Array.isArray(parsed?.links) ? parsed.links : [])
    .map((l) => normalizeLink(l, maxClaim, maxEvidence))
    .filter((l): l is LlmLink => l !== null);

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
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) body = rawBody as Record<string, unknown>;
  } catch {
    // use defaults
  }
  const maxStories = clampInt(body.max_stories, 1, 1, MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  let supabase: ReturnType<typeof createClient> | null = null;
  let storyIds: string[] = [];
  let runId: string | null = null;
  try {
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Candidates: KEEP, not being processed, never extracted (completed_at null) and not marked skipped-empty
    const { data: candidatesRaw, error: fetchErr } = await supabase
      .from("stories")
      .select("story_id, title, content_snippet, content_full, scraped_content, url, created_at, sources(name)")
      .eq("relevance_status", "KEEP")
      .eq("being_processed", false)
      .is("extraction_completed_at", null)
      .eq("extraction_skipped_empty", false)
      .order("created_at", { ascending: true })
      .limit(maxStories);

    if (fetchErr) {
      console.error("[extract_story_claims_evidence] Fetch error:", fetchErr.message);
      return json({ error: fetchErr.message }, 500);
    }

    const candidates = (Array.isArray(candidatesRaw) ? candidatesRaw : []).filter(
      (s): s is StoryRow => typeof s === "object" && s !== null && typeof (s as StoryRow).story_id === "string"
    );

    if (candidates.length === 0) {
      return json({ ok: true, processed: 0, message: "No stories to extract" });
    }

    const story = candidates[0];
    storyIds = [story.story_id];

    const { error: lockErr } = await supabase.from("stories").update({ being_processed: true }).in("story_id", storyIds);
    if (lockErr) {
      console.error("[extract_story_claims_evidence] Lock error:", lockErr.message);
      return json({ error: lockErr.message }, 500);
    }

    try {
      const { data: runData, error: runInsertErr } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "claim_extraction",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
        })
        .select("run_id")
        .single();
      if (!runInsertErr && runData?.run_id) runId = runData.run_id;
    } catch (_) {
      // continue without run_id
    }

    const requestId = `extract-${Date.now()}`;
    const sourceName = getSourceName(story.sources);
    const storyUrl = story.url ?? "";
    const fromFull = (story.content_full ?? "").trim();
    const fromSnippet = (story.content_snippet ?? "").trim();
    const fromScraped = (story.scraped_content ?? "").trim();
    const final_content = [fromFull, fromSnippet, fromScraped].reduce(
      (best, s) => (s.length > best.length ? s : best),
      ""
    );

    const chunks = chunkText(final_content, CHUNK_SIZE, CHUNK_OVERLAP);
    const allClaims: LlmClaim[] = [];
    const allEvidence: LlmEvidence[] = [];
    const allLinks: LlmLink[] = [];
    let claimOffset = 0;
    let evidenceOffset = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkResult = await callOpenAIChunk(
        OPENAI_API_KEY,
        MODEL,
        story.story_id,
        story.title ?? "",
        sourceName,
        storyUrl,
        chunks[i],
        `${requestId}-chunk-${i}`
      );
      allClaims.push(...chunkResult.claims);
      allEvidence.push(...chunkResult.evidence);
      for (const link of chunkResult.links) {
        allLinks.push({
          claim_index: link.claim_index + claimOffset,
          evidence_index: link.evidence_index + evidenceOffset,
          relation_type: link.relation_type,
          confidence: link.confidence,
          rationale: link.rationale,
        });
      }
      claimOffset += chunkResult.claims.length;
      evidenceOffset += chunkResult.evidence.length;
    }

    const now = new Date().toISOString();
    const isEmpty = allClaims.length === 0 && allEvidence.length === 0;
    const seenLinkKeys = new Set<string>();
    const uniqueLinks = allLinks.filter((link) => {
      const key = `${link.claim_index},${link.evidence_index}`;
      if (seenLinkKeys.has(key)) return false;
      seenLinkKeys.add(key);
      return true;
    });

    if (!dryRun) {
      if (isEmpty) {
        const { error: upErr } = await supabase
          .from("stories")
          .update({ extraction_skipped_empty: true })
          .eq("story_id", story.story_id);
        if (upErr) {
          console.error("[extract_story_claims_evidence] Update story (empty) error:", upErr.message);
          return json({ error: upErr.message }, 500);
        }
      } else {
        const storyClaimIds: string[] = [];
        const evidenceIds: string[] = [];

        for (const c of allClaims) {
          const { data: ins, error: e } = await supabase
            .from("story_claims")
            .insert({
              story_id: story.story_id,
              raw_text: c.raw_text,
              polarity: c.polarity,
              extraction_confidence: c.extraction_confidence,
              span_start: c.span_start ?? null,
              span_end: c.span_end ?? null,
              run_id: runId,
            })
            .select("story_claim_id")
            .single();
          if (e) {
            console.error("[extract_story_claims_evidence] Insert story_claim error:", e.message);
            return json({ error: e.message }, 500);
          }
          if (ins?.story_claim_id) storyClaimIds.push(ins.story_claim_id);
        }

        for (const e of allEvidence) {
          const { data: ins, error: err } = await supabase
            .from("story_evidence")
            .insert({
              story_id: story.story_id,
              evidence_type: e.evidence_type,
              excerpt: e.excerpt,
              attribution: e.attribution ?? null,
              source_ref: e.source_ref ?? null,
              extraction_confidence: e.extraction_confidence,
              metadata: e.metadata ?? {},
              run_id: runId,
            })
            .select("evidence_id")
            .single();
          if (err) {
            console.error("[extract_story_claims_evidence] Insert story_evidence error:", err.message);
            return json({ error: err.message }, 500);
          }
          if (ins?.evidence_id) evidenceIds.push(ins.evidence_id);
        }

        for (const link of uniqueLinks) {
          const scId = storyClaimIds[link.claim_index];
          const evId = evidenceIds[link.evidence_index];
          if (!scId || !evId) continue;
          const { error: linkErr } = await supabase.from("story_claim_evidence_links").insert({
            story_claim_id: scId,
            evidence_id: evId,
            relation_type: link.relation_type,
            confidence: link.confidence,
            rationale: link.rationale ?? null,
            run_id: runId,
          });
          if (linkErr) {
            console.error("[extract_story_claims_evidence] Insert link error:", linkErr.message);
          }
        }

        const { error: upErr } = await supabase
          .from("stories")
          .update({
            extraction_completed_at: now,
            extraction_skipped_empty: false,
          })
          .eq("story_id", story.story_id);
        if (upErr) {
          console.error("[extract_story_claims_evidence] Update story (done) error:", upErr.message);
          return json({ error: upErr.message }, 500);
        }
      }

      if (runId) {
        const linksCount = isEmpty ? 0 : uniqueLinks.length;
        await supabase
          .from("pipeline_runs")
          .update({
            status: isEmpty ? "completed_empty" : "completed",
            ended_at: now,
            counts: { claims: allClaims.length, evidence: allEvidence.length, links: linksCount },
          })
          .eq("run_id", runId);
      }
    }

    return json({
      ok: true,
      processed: 1,
      dry_run: dryRun,
      story_id: story.story_id,
      extraction_skipped_empty: isEmpty,
      counts: { claims: allClaims.length, evidence: allEvidence.length, links: uniqueLinks.length },
      chunks: chunks.length,
      model: MODEL,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
    console.error("[extract_story_claims_evidence] Error:", msg, e);
    try {
      if (runId && supabase) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
          .eq("run_id", runId);
      }
    } catch (_) {
      // ignore so we always return a proper 500 body
    }
    return json({ error: msg }, 500);
  } finally {
    if (supabase && storyIds.length > 0) {
      const { error: unlockErr } = await supabase
        .from("stories")
        .update({ being_processed: false })
        .in("story_id", storyIds);
      if (unlockErr) console.error("[extract_story_claims_evidence] Unlock error:", unlockErr.message);
    }
  }
});
