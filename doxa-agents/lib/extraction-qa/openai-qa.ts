import { METADATA_PROMPT_BLOCK } from "./story-metadata.ts";
import { ISSUE_TYPES, type RefinementPatchResult, ReviewReport, ValidationReport } from "./types.ts";

const DEFAULT_MODEL = "gpt-4o-mini";

export async function callOpenAIJson<T>(
  apiKey: string,
  model: string,
  system: string,
  userPayload: unknown,
  schemaName: string,
  schema: Record<string, unknown>,
  requestId: string,
  strict = true
): Promise<T> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict, schema },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");
  return JSON.parse(contentStr) as T;
}

const PATCH_OBJECT_SCHEMA = {
  type: ["object", "null"],
  properties: {
    entity_type: { type: ["string", "null"] },
    raw_text: { type: ["string", "null"] },
    excerpt: { type: ["string", "null"] },
    excerpt_text: { type: ["string", "null"] },
    evidence_type: { type: ["string", "null"] },
    event_summary: { type: ["string", "null"] },
    polarity: { type: ["string", "null"] },
    stance: { type: ["string", "null"] },
    extraction_confidence: { type: ["number", "null"] },
    source_excerpt: { type: ["string", "null"] },
    span_start: { type: ["integer", "null"] },
    span_end: { type: ["integer", "null"] },
    location: { type: ["string", "null"] },
    event_type: { type: ["string", "null"] },
    position_type: { type: ["string", "null"] },
    holder: { type: ["string", "null"] },
    claim_index: { type: ["integer", "null"] },
    evidence_index: { type: ["integer", "null"] },
    position_index: { type: ["integer", "null"] },
    event_index: { type: ["integer", "null"] },
    relation_type: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
    rationale: { type: ["string", "null"] },
  },
  required: [
    "entity_type",
    "raw_text",
    "excerpt",
    "excerpt_text",
    "evidence_type",
    "event_summary",
    "polarity",
    "stance",
    "extraction_confidence",
    "source_excerpt",
    "span_start",
    "span_end",
    "location",
    "event_type",
    "position_type",
    "holder",
    "claim_index",
    "evidence_index",
    "position_index",
    "event_index",
    "relation_type",
    "confidence",
    "rationale",
  ],
  additionalProperties: false,
} as const;

const RECOMMENDED_PATCH_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["add", "remove", "update", "link", "unlink", "none"] },
    entity_type: { type: ["string", "null"] },
    entity_index: { type: ["integer", "null"] },
    replacement_text: { type: ["string", "null"] },
    new_entity: PATCH_OBJECT_SCHEMA,
    link: PATCH_OBJECT_SCHEMA,
  },
  required: ["op", "entity_type", "entity_index", "replacement_text", "new_entity", "link"],
  additionalProperties: false,
} as const;

const QUALITY_SCORES_SCHEMA = {
  type: "object",
  properties: {
    grounding: { type: "number", minimum: 0, maximum: 1 },
    completeness: { type: "number", minimum: 0, maximum: 1 },
    temporal_accuracy: { type: "number", minimum: 0, maximum: 1 },
    granularity: { type: "number", minimum: 0, maximum: 1 },
    provenance_quality: { type: "number", minimum: 0, maximum: 1 },
    position_capture: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["grounding", "completeness", "temporal_accuracy", "granularity", "provenance_quality", "position_capture"],
  additionalProperties: false,
};

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    passes_review: { type: "boolean" },
    recommended_action: { type: "string", enum: ["accept", "refine", "validate", "human_review"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...ISSUE_TYPES] },
          severity: { type: "string", enum: ["blocking", "major", "minor"] },
          entity_type: { type: ["string", "null"] },
          entity_index: { type: ["integer", "null"] },
          link_type: { type: ["string", "null"] },
          description: { type: "string" },
          unsupported_text: { type: ["string", "null"] },
          source_excerpt: { type: ["string", "null"] },
          recommended_patch: RECOMMENDED_PATCH_SCHEMA,
        },
        required: [
          "type",
          "severity",
          "entity_type",
          "entity_index",
          "link_type",
          "description",
          "unsupported_text",
          "source_excerpt",
          "recommended_patch",
        ],
        additionalProperties: false,
      },
    },
    quality_scores: QUALITY_SCORES_SCHEMA,
  },
  required: ["passes_review", "recommended_action", "summary", "findings", "quality_scores"],
  additionalProperties: false,
} as const;

export const VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    passes: { type: "boolean" },
    recommended_status: {
      type: "string",
      enum: ["promote", "refine_once_more", "needs_human_review", "reject", "passed", "needs_refinement", "atoms_passed"],
    },
    summary: { type: "string" },
    scores: {
      type: "object",
      properties: {
        grounding: { type: "number", minimum: 0, maximum: 1 },
        completeness: { type: "number", minimum: 0, maximum: 1 },
        granularity: { type: "number", minimum: 0, maximum: 1 },
        provenance_quality: { type: "number", minimum: 0, maximum: 1 },
        temporal_accuracy: { type: "number", minimum: 0, maximum: 1 },
        position_capture: { type: "number", minimum: 0, maximum: 1 },
        schema_validity: { type: "number", minimum: 0, maximum: 1 },
        merge_fidelity: { type: "number", minimum: 0, maximum: 1 },
      },
      required: [
        "grounding",
        "completeness",
        "granularity",
        "provenance_quality",
        "temporal_accuracy",
        "position_capture",
        "schema_validity",
      ],
      additionalProperties: false,
    },
    blocking_issues: { type: "array", items: { type: "string" } },
    major_issues: { type: "array", items: { type: "string" } },
    minor_warnings: { type: "array", items: { type: "string" } },
    promotion_gate: {
      type: "object",
      properties: {
        eligible_for_promotion: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["eligible_for_promotion", "reason"],
      additionalProperties: false,
    },
  },
  required: [
    "passes",
    "recommended_status",
    "summary",
    "scores",
    "blocking_issues",
    "major_issues",
    "minor_warnings",
    "promotion_gate",
  ],
  additionalProperties: false,
} as const;

export const PATCH_SCHEMA = {
  type: "object",
  properties: {
    patches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "remove", "update", "link", "unlink"] },
          entity_type: { type: "string" },
          entity_index: { type: ["integer", "null"] },
          value: PATCH_OBJECT_SCHEMA,
        },
        required: ["op", "entity_type", "entity_index", "value"],
        additionalProperties: false,
      },
    },
    ignored_findings: { type: "array", items: { type: "string" } },
  },
  required: ["patches", "ignored_findings"],
  additionalProperties: false,
} as const;

export const CHUNK_REVIEW_SYSTEM = `You are the Extraction Review Agent for Doxa.

Audit chunk extraction (atoms + provenance only — no semantic relationship arrays). Do not rewrite. Be precise and source-grounded.

${METADATA_PROMPT_BLOCK}

Evaluate: grounding, provenance validity, temporal accuracy, granularity, missing article positions, hallucinations, duplicates, over-merged claims, aggregate vs atomic events, evidence typing, claim style.

DO NOT review: claim_evidence_links, orphan links, evidence count vs claim count, or relationship coverage.

COMPLETENESS (major when violated):
1. Missing major factual claims, statistics, or events visible in chunk text.
2. Central article interpretive stance missing when the chunk advances a macro thesis.
3. Public statements or aggregate military/policy patterns omitted.

PROVENANCE (blocking when violated):
1. source_excerpt missing or not verbatim chunk wording.
2. Atom text invents actors, dates, places, quantities, or actions not in source_excerpt.
3. Event location not supported by that event's source_excerpt.

PRECISION (major when violated):
1. Rhetorical filler claims or malformed fragments.
2. Duplicate claims/events.
3. evidence_type quote on narrator prose — use reported_fact or statistic.
4. Claims prefixed with "The article says…" when attribution is not the point.
5. Bad event granularity (same act as two events, or unrelated aggregate replacing a specific event).

CRITICAL RULES:
1. Do not flag supported paraphrases as unsupported.
2. Severity: blocking = hallucinated date, unsupported factual claim, provenance failure; major = missing atoms, bad typing, duplicates; minor = wording, confidence.
3. Recommend add/remove/update patches on entities — never link/unlink patches.
4. Treat deterministic_issues as pre-confirmed for provenance and dates.

Output findings with recommended_patch for each fixable issue.`;

export const CHUNK_VALIDATE_SYSTEM = `You are the Extraction Validator Agent for Doxa.

Decide whether atom extraction (with provenance) is safe to advance to the link step. Strict. Do not repair.

${METADATA_PROMPT_BLOCK}

Pass only if: no blocking hallucinations, no invented dates, core claims captured, central position when present, every atom has valid source_excerpt, evidence excerpts verbatim, events granular and locations grounded, evidence types correct.

Do NOT require: evidence atoms per claim, claim_evidence_links, or relationship coverage.

Minor issues can pass with warnings. Blocking provenance or grounding issues cannot pass.

Set recommended_status to passed when passes=true; needs_human_review when blocking issues remain; needs_refinement when fixable major issues remain.

Note: deterministic pre-checks already passed. Focus on atom completeness and provenance quality — not links.`;

export const MERGE_REVIEW_SYSTEM = `You are the Extraction Review Agent for Doxa at story merge level.

Compare full article text to merged extraction JSON. Report findings only; do not rewrite.

${METADATA_PROMPT_BLOCK}

Focus on: missing central article position, merge drift vs chunk content, duplicates, aggregate vs atomic events, broken links, temporal grounding.

Treat deterministic_issues as pre-confirmed blocking. Do not flag supported paraphrases as hallucinations.`;

export const MERGE_VALIDATE_SYSTEM = `You judge merged story extraction for Doxa. Include merge_fidelity in scores (0-1).

${METADATA_PROMPT_BLOCK}

Set passes=true only when story-level extraction is production-ready for canonicalization. Deterministic pre-checks have already passed.`;

export const CHUNK_REFINE_SYSTEM = `You are the Extraction Refiner Agent for Doxa.

Apply reviewer findings to atoms + provenance only. Not a fresh extractor. Preserve valid atoms unless a finding targets them.

${METADATA_PROMPT_BLOCK}

RULES:
1. Apply findings: remove hallucinations, fix provenance (source_excerpt, spans), fix malformed claims, fix evidence types, dedupe atoms.
2. When adding atoms, use exact chunk wording for source_excerpt and evidence excerpt.
3. Do not invent locations, dates, actors, or relationships. Do not output link/unlink patches.
4. Do not replace a valid specific event with an unrelated aggregate event.
5. If reviewer incorrectly flagged supported content, preserve and list in ignored_findings.
6. Preserve relative temporal language from the article.
7. Output patches only: add, remove, update on claims/evidence/positions/events — never link or unlink.
8. Do not create semantic link arrays.`;

export const MERGE_REFINE_SYSTEM = `You apply targeted patches to merged story extraction based on reviewer findings.

${METADATA_PROMPT_BLOCK}

Output patches to claims/evidence/positions/events and link arrays. Minimal changes only. List ignored_findings when reviewer flags were wrong.`;

function normalizeReviewReport(raw: ReviewReport): ReviewReport {
  const action = raw.recommended_action;
  const normalizedAction =
    action === "accept" ? "validate" : action === "validate" ? "validate" : action === "human_review" ? "human_review" : "refine";
  return {
    ...raw,
    recommended_action: normalizedAction as ReviewReport["recommended_action"],
    findings: (raw.findings ?? []).map((f) => ({
      ...f,
      severity: f.severity === "warning" ? "minor" : f.severity,
    })),
  };
}

function normalizeValidationReport(raw: ValidationReport): ValidationReport {
  let status = raw.recommended_status;
  if (status === "promote") status = "atoms_passed";
  if (status === "refine_once_more") status = "needs_refinement";
  if (status === "reject") status = "needs_human_review";
  const scores = { ...raw.scores };
  if (scores.provenance_quality === undefined && scores.link_quality !== undefined) {
    scores.provenance_quality = scores.link_quality;
  }
  return { ...raw, recommended_status: status, scores };
}

export async function reviewChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ReviewReport> {
  const raw = await callOpenAIJson<ReviewReport>(
    apiKey,
    model,
    CHUNK_REVIEW_SYSTEM,
    payload,
    "doxa_chunk_review",
    REVIEW_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
  return normalizeReviewReport(raw);
}

export async function validateChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ValidationReport> {
  const raw = await callOpenAIJson<ValidationReport>(
    apiKey,
    model,
    CHUNK_VALIDATE_SYSTEM,
    payload,
    "doxa_chunk_validate",
    VALIDATION_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
  return normalizeValidationReport(raw);
}

export async function refineChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<RefinementPatchResult> {
  const result = await callOpenAIJson<RefinementPatchResult>(
    apiKey,
    model,
    CHUNK_REFINE_SYSTEM,
    payload,
    "doxa_chunk_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId,
    false
  );
  result.patches = (result.patches ?? []).filter((p) => p.op !== "link" && p.op !== "unlink");
  return result;
}

export type ChunkLinkResult = {
  claim_evidence_links: unknown[];
  position_claim_links: unknown[];
  position_evidence_links: unknown[];
  event_claim_links: unknown[];
  event_evidence_links: unknown[];
};

export async function linkChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ChunkLinkResult> {
  return callOpenAIJson<ChunkLinkResult>(
    apiKey,
    model,
    CHUNK_LINK_SYSTEM,
    payload,
    "doxa_chunk_link",
    CHUNK_LINK_JSON_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
}

export async function reviewMerged(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ReviewReport> {
  const raw = await callOpenAIJson<ReviewReport>(
    apiKey,
    model,
    MERGE_REVIEW_SYSTEM,
    payload,
    "doxa_merge_review",
    REVIEW_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
  return normalizeReviewReport(raw);
}

export async function validateMerged(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ValidationReport> {
  const schema = {
    ...VALIDATION_SCHEMA,
    properties: {
      ...VALIDATION_SCHEMA.properties,
      scores: {
        ...VALIDATION_SCHEMA.properties.scores,
        required: [
          "grounding",
          "completeness",
          "granularity",
          "provenance_quality",
          "temporal_accuracy",
          "position_capture",
          "schema_validity",
          "merge_fidelity",
        ],
      },
    },
  };
  const raw = await callOpenAIJson<ValidationReport>(
    apiKey,
    model,
    MERGE_VALIDATE_SYSTEM,
    payload,
    "doxa_merge_validate",
    schema as unknown as Record<string, unknown>,
    requestId
  );
  const normalized = normalizeValidationReport(raw);
  if (normalized.scores.merge_fidelity === undefined) {
    normalized.scores.merge_fidelity = 0.8;
  }
  return normalized;
}

export async function refineMerged(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<RefinementPatchResult> {
  return callOpenAIJson<RefinementPatchResult>(
    apiKey,
    model,
    MERGE_REFINE_SYSTEM,
    payload,
    "doxa_merge_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId,
    false
  );
}

export async function saveArtifact(
  supabase: { from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> } },
  row: {
    story_id: string;
    chunk_index?: number | null;
    stage: string;
    input_snapshot?: unknown;
    output_snapshot?: unknown;
    report?: unknown;
    run_id?: string | null;
  }
) {
  return supabase.from("story_extraction_qa_artifacts").insert(row);
}

export const EXTRACT_SYSTEM_PROMPT = `You are the Story Extraction Agent for Doxa.

Extract atoms with provenance from a single chunk. No semantic relationship arrays. Only chunk text — no outside knowledge.

${METADATA_PROMPT_BLOCK}

PROVENANCE vs EVIDENCE:
- Every claim, evidence item, position, and event MUST have source_excerpt: exact verbatim wording from the chunk where the atom is grounded.
- Evidence atoms are content units (quotes, stats, reported facts) — not merely "where we found" a claim.
- Do not treat a claim's source_excerpt as automatically being a separate evidence atom.

TEMPORAL:
- Do not invent dates or years not in the chunk. Preserve relative language ("on Wednesday", "this term").

ENTITIES:
- claims: clean standalone propositions (no "The article says…" unless attribution matters)
- evidence: quote (attributed speech only), statistic, reported_fact (narration of concrete facts), document_reference, context, other
- positions: article_stance / actor_stance / implied_stance with holder article|author|quoted_actor
- events: public_statement, aggregate_event, military_action, policy_action, etc. Location must appear in that event's source_excerpt

COMPLETENESS:
- Capture quantitative claims, statistics, threats, central stance, public statements, aggregate patterns when present.
- Claims and events do NOT require separate evidence atoms — provenance is required.

PRECISION:
- No section-transition filler claims. One event per distinct public act. No duplicate near-identical claims.

Return JSON only: claims, evidence, positions, events — each with source_excerpt, span_start, span_end, extraction_confidence.`;

export const CHUNK_LINK_SYSTEM = `You are the Chunk Link Agent for Doxa.

Given validated atoms (claims, evidence, positions, events) and chunk text, output semantic relationship arrays only. Do not add, remove, or edit atoms.

${METADATA_PROMPT_BLOCK}

RULES:
1. Link only between existing atom indices (0-based).
2. claim_evidence_links: precise supports|contradicts|contextual — quote about Oman supports Oman claim, not unrelated aggregate claims.
3. event_evidence_links when evidence grounds an event; event_claim_links for about|describes|disputes|causes.
4. position_claim_links and position_evidence_links when clearly supported.
5. Prefer no link over a speculative link.
6. Do not require every claim to have evidence links.

Return link arrays only in the required schema.`;

export const CHUNK_LINK_JSON_SCHEMA = {
  type: "object",
  properties: {
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
  },
  required: [
    "claim_evidence_links",
    "position_claim_links",
    "position_evidence_links",
    "event_claim_links",
    "event_evidence_links",
  ],
  additionalProperties: false,
} as const;
