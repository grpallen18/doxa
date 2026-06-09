import { STANDARDIZE_JSON_SCHEMA } from "./atom-schema.ts";
import { METADATA_PROMPT_BLOCK } from "./story-metadata.ts";
import { DEFAULT_CHUNK_QA_MODEL } from "./chunk-qa-model.ts";
import {
  CLAIMS_REVIEW_ISSUE_TYPES,
  ISSUE_TYPES,
  normalizeBlockingIssues,
  POSITIONS_REVIEW_ISSUE_TYPES,
  type ClaimsReviewReport,
  type PositionsReviewReport,
  type RefinementPatchResult,
  type ReviewReport,
  type StandardizationReport,
  type ValidationReport,
} from "./types.ts";

const DEFAULT_MODEL = DEFAULT_CHUNK_QA_MODEL;

export async function callOpenAIJson<T>(
  apiKey: string,
  model: string,
  system: string,
  userPayload: unknown,
  schemaName: string,
  schema: Record<string, unknown>,
  requestId: string,
  strict = true,
  timeoutMs = 120_000
): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("Timed out")) {
      throw new Error(
        `OpenAI timed out after ${timeoutMs}ms (model: ${model}). Set OPENAI_MODEL_EXTRACT=gpt-4o-mini on Edge secrets if this persists.`
      );
    }
    throw e;
  }

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

const CLAIMS_QUALITY_SCORES_SCHEMA = {
  type: "object",
  properties: {
    grounding: { type: "number", minimum: 0, maximum: 1 },
    completeness: { type: "number", minimum: 0, maximum: 1 },
    temporal_accuracy: { type: "number", minimum: 0, maximum: 1 },
    materiality: { type: "number", minimum: 0, maximum: 1 },
    provenance_quality: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["grounding", "completeness", "temporal_accuracy", "materiality", "provenance_quality"],
  additionalProperties: false,
} as const;

const CLAIMS_REVIEW_ISSUE_SCHEMA = {
  type: "object",
  properties: {
    severity: { type: "string", enum: ["blocking", "major", "minor"] },
    claim_id: { type: ["string", "null"] },
    claim_index: { type: ["integer", "null"] },
    issue_type: { type: "string", enum: [...CLAIMS_REVIEW_ISSUE_TYPES] },
    finding: { type: "string" },
  },
  required: ["severity", "claim_id", "claim_index", "issue_type", "finding"],
  additionalProperties: false,
} as const;

const CLAIMS_REVIEW_PATCH_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "remove", "update", "merge", "split"] },
    entity_type: { type: "string", enum: ["claim"] },
    severity: { type: "string", enum: ["blocking", "major", "minor"] },
    claim_ids: { type: "array", items: { type: "string" } },
    claim_indexes: { type: "array", items: { type: "integer" } },
    recommended_raw_text: { type: ["string", "null"] },
    reason: { type: "string" },
    source_grounding: { type: "string" },
  },
  required: [
    "action",
    "entity_type",
    "severity",
    "claim_ids",
    "claim_indexes",
    "recommended_raw_text",
    "reason",
    "source_grounding",
  ],
  additionalProperties: false,
} as const;

export const CLAIMS_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    passes_review: { type: "boolean" },
    recommended_action: { type: "string", enum: ["validate", "needs_refinement", "reject"] },
    summary: { type: "string" },
    issues: { type: "array", items: CLAIMS_REVIEW_ISSUE_SCHEMA },
    patches: { type: "array", items: CLAIMS_REVIEW_PATCH_SCHEMA },
  },
  required: ["passes_review", "recommended_action", "summary", "issues", "patches"],
  additionalProperties: false,
} as const;

const POSITIONS_REVIEW_ISSUE_SCHEMA = {
  type: "object",
  properties: {
    severity: { type: "string", enum: ["blocking", "major", "minor"] },
    position_id: { type: ["string", "null"] },
    position_index: { type: ["integer", "null"] },
    issue_type: { type: "string", enum: [...POSITIONS_REVIEW_ISSUE_TYPES] },
    finding: { type: "string" },
  },
  required: ["severity", "position_id", "position_index", "issue_type", "finding"],
  additionalProperties: false,
} as const;

const POSITIONS_REVIEW_PATCH_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "remove", "update", "merge", "split"] },
    entity_type: { type: "string", enum: ["position"] },
    severity: { type: "string", enum: ["blocking", "major", "minor"] },
    position_ids: { type: "array", items: { type: "string" } },
    position_indexes: { type: "array", items: { type: "integer" } },
    recommended_raw_text: { type: ["string", "null"] },
    reason: { type: "string" },
    source_grounding: { type: "string" },
  },
  required: [
    "action",
    "entity_type",
    "severity",
    "position_ids",
    "position_indexes",
    "recommended_raw_text",
    "reason",
    "source_grounding",
  ],
  additionalProperties: false,
} as const;

export const POSITIONS_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    passes_review: { type: "boolean" },
    recommended_action: { type: "string", enum: ["validate", "needs_refinement", "reject"] },
    summary: { type: "string" },
    issues: { type: "array", items: POSITIONS_REVIEW_ISSUE_SCHEMA },
    patches: { type: "array", items: POSITIONS_REVIEW_PATCH_SCHEMA },
  },
  required: ["passes_review", "recommended_action", "summary", "issues", "patches"],
  additionalProperties: false,
} as const;

const BLOCKING_ISSUE_SCHEMA = {
  type: "object",
  properties: {
    issue_type: {
      type: "string",
      enum: [
        "bad_atom_type",
        "missing_field",
        "unsupported_field",
        "bad_syntax",
        "noise",
        "duplicate",
        "provenance_error",
        "other",
      ],
    },
    entity_type: { type: ["string", "null"], enum: ["claim", "evidence", "position", "event", null] },
    entity_index: { type: ["integer", "null"] },
    description: { type: "string" },
    acceptance_criteria: { type: "string" },
  },
  required: ["issue_type", "entity_type", "entity_index", "description", "acceptance_criteria"],
  additionalProperties: false,
} as const;

const CHUNK_VALIDATION_SCORES_SCHEMA = {
  type: "object",
  properties: {
    grounding: { type: "number", minimum: 0, maximum: 1 },
    completeness: { type: "number", minimum: 0, maximum: 1 },
    granularity: { type: "number", minimum: 0, maximum: 1 },
    provenance_quality: { type: "number", minimum: 0, maximum: 1 },
    temporal_accuracy: { type: "number", minimum: 0, maximum: 1 },
    position_capture: { type: "number", minimum: 0, maximum: 1 },
    schema_validity: { type: "number", minimum: 0, maximum: 1 },
    taxonomy_quality: { type: "number", minimum: 0, maximum: 1 },
    materiality: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "grounding",
    "completeness",
    "granularity",
    "provenance_quality",
    "temporal_accuracy",
    "position_capture",
    "schema_validity",
    "taxonomy_quality",
    "materiality",
  ],
  additionalProperties: false,
} as const;

export const CHUNK_VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    passes: { type: "boolean" },
    recommended_status: {
      type: "string",
      enum: ["promote", "refine_once_more", "needs_human_review", "reject", "passed", "needs_refinement", "atoms_passed"],
    },
    recommended_next_agent: { type: "string", enum: ["refiner", "human_review"] },
    attempt_number: { type: "integer", minimum: 1 },
    summary: { type: "string" },
    scores: CHUNK_VALIDATION_SCORES_SCHEMA,
    blocking_issues: { type: "array", items: BLOCKING_ISSUE_SCHEMA },
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
    "recommended_next_agent",
    "attempt_number",
    "summary",
    "scores",
    "blocking_issues",
    "major_issues",
    "minor_warnings",
    "promotion_gate",
  ],
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

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (validate-chunk-claims). */
export const CHUNK_CLAIMS_REVIEW_SYSTEM = `You are the Primary Claims Review Agent for Doxa.

Audit one chunk's primary claims extraction (claims array only). Do not rewrite claims in place — report findings only. Be precise and source-grounded.

${METADATA_PROMPT_BLOCK}

INPUT: chunk_text and extraction_json.claims (each claim has raw_text; polarity/stance optional).

EVALUATE:
1. Grounding — every claim must be supported by the chunk text; no outside knowledge.
2. Materiality — missing major factual claims visible in the chunk (major severity).
3. Temporal accuracy — dates/years/timeframes in claim text must appear in or be clearly anchored by the chunk (blocking if invented).
4. Claim quality — standalone sentences, not quotes-as-claims, not rhetorical filler, not duplicate/over-merged claims.
5. Count — aim for 1–4 primary claims; flag excess weak claims (major).

DO NOT review: evidence, positions, events, links, span_start/span_end.

SEVERITY:
- blocking — unsupported factual assertion, invented date, claim not a complete sentence
- major — missing important claim, duplicate, weak/non-material claim, bad attribution
- minor — wording, confidence, style

RULES:
1. Treat deterministic_issues as pre-confirmed blocking facts (do not re-litigate).
2. Ignore span_mismatch entries in deterministic_issues.
3. Recommend add/remove/update patches on claims only — entity_type must be "claim".
4. Set passes_review=true and recommended_action=validate only when production-ready for merge.
5. Write summary as 2–4 sentences synthesizing all issues (deterministic + your findings).`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (refine-chunk-claims). */
export const CHUNK_CLAIMS_REFINE_SYSTEM = `You are the Primary Claims Refiner for Doxa.

Apply targeted patches to fix reviewer findings on one chunk's claims array. Not a fresh extractor.

${METADATA_PROMPT_BLOCK}

RULES:
1. Apply review_report findings — especially blocking and major with recommended_patch.
2. Output patches only: add, remove, update on claims — never link/unlink.
3. When adding/updating claims, raw_text must be a complete standalone sentence grounded in chunk_text only.
4. Do not invent dates, actors, or facts not in chunk_text.
5. Do not patch span_start or span_end — pipeline recomputes from source_excerpt if present.
6. Minimal changes only. List ignored_findings when reviewer incorrectly flagged supported content.`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (validate-chunk-positions). */
export const CHUNK_POSITIONS_REVIEW_SYSTEM = `You are the Position Extraction Review Agent for Doxa.

Audit one chunk's positions extraction (positions array only). Do not rewrite positions in place — report findings only. Be precise and source-grounded.

${METADATA_PROMPT_BLOCK}

INPUT: chunk_text, optional existing claims array, and positions_extraction_json.positions (each position has raw_text, signal_type, provenance, source_ownership).

EVALUATE:
1. Grounding — every position must be supported by the chunk text; no outside knowledge.
2. Stance vs claim — positions express source stance/thesis; do not require converting every claim into a position.
3. Attribution — attributed positions must preserve speaker; do not flatten attributed stances into the source's own view unless endorsed.
4. Implicit positions — require multiple supporting spans or clear inference rationale; flag weak single-sentence inferences (major/blocking).
5. Temporal accuracy — timeframes in position text must appear in or be anchored by the chunk (blocking if invented).
6. Quality — standalone sentences, not fragments; no duplicate positions with minor wording differences.
7. Precision — prefer fewer strong positions; flag excess weak positions (major).

DO NOT review: claims, evidence, events, links, span_start/span_end.

SEVERITY:
- blocking — unsupported stance, invented date, attribution flattened, implicit position from single vague sentence
- major — missing central stance, duplicate, weak/non-material position, bad attribution
- minor — wording, confidence, signature fields

RULES:
1. Treat deterministic_issues as pre-confirmed blocking facts (do not re-litigate).
2. Ignore span_mismatch entries in deterministic_issues.
3. Recommend add/remove/update patches on positions only — entity_type must be "position".
4. Set passes_review=true and recommended_action=validate only when production-ready for merge.
5. Write summary as 2–4 sentences synthesizing all issues (deterministic + your findings).`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (refine-chunk-positions). */
export const CHUNK_POSITIONS_REFINE_SYSTEM = `You are the Position Extraction Refiner for Doxa.

Apply targeted patches to fix reviewer findings on one chunk's positions array. Not a fresh extractor.

${METADATA_PROMPT_BLOCK}

RULES:
1. Apply review_report findings — especially blocking and major with recommended_patch.
2. Output patches only: add, remove, update on positions — never link/unlink.
3. When adding/updating positions, raw_text must be a complete standalone sentence grounded in chunk_text only.
4. Preserve attribution and source_ownership for attributed positions.
5. Do not invent dates, actors, or facts not in chunk_text.
6. Do not patch span_start or span_end — pipeline recomputes from source_excerpt if present.
7. Minimal changes only. List ignored_findings when reviewer incorrectly flagged supported content.`;

export const CHUNK_REVIEW_SYSTEM = `You are the Extraction Review Agent for Doxa.

Audit chunk extraction (atoms + provenance only — no semantic relationship arrays). Do not rewrite. Be precise and source-grounded.

${METADATA_PROMPT_BLOCK}

Evaluate: grounding, provenance validity, temporal accuracy, granularity, missing article/author positions, hallucinations, duplicates, over-merged claims, aggregate vs atomic events, evidence typing, claim style.

DO NOT review: claim_evidence_links, orphan links, evidence count vs claim count, relationship coverage, or span_start/span_end (server-computed from source_excerpt after your review).

COMPLETENESS (major when violated):
1. Missing major factual claims, statistics, or events visible in chunk text.
2. Central article or author interpretive stance missing when the chunk advances a macro thesis or evaluative framing.
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
6. Positions misclassified: narrated actions or reported facts tagged as actor_stance; missing author/article stance on analytical judgment.

CRITICAL RULES:
1. Do not flag supported paraphrases in raw_text as unsupported when source_excerpt is verbatim and grounded.
2. Do not flag span_mismatch — spans are not your responsibility.
3. Severity: blocking = hallucinated date, unsupported factual claim, provenance failure; major = missing atoms, bad typing, duplicates, position taxonomy; minor = wording, confidence.
4. Recommend add/remove/update patches on entities — never link/unlink patches. Do not patch span_start/span_end.
5. Treat deterministic_issues as pre-confirmed for provenance and dates (ignore span_mismatch entries).

Output findings with recommended_patch for each fixable issue.`;

export const CHUNK_STANDARDIZE_SYSTEM = `You are the Chunk Standardizer Agent for Doxa.

Transform candidate extraction atoms into production-ready standardized atoms. Editorial/taxonomy layer — not a fresh extractor.

${METADATA_PROMPT_BLOCK}

INPUT: candidate claims, evidence, positions, events with provenance from the extractor.
OUTPUT: cleaned claims, evidence, positions, events + standardization_report (kept, merged, reclassified, discarded, notes).

RULES:
1. Reclassify candidates into correct atom types. Merge duplicates. Discard noisy or low-materiality candidates.
2. Rewrite raw_text/excerpt/event fields into Doxa-standard syntax. source_excerpt MUST remain exact verbatim substring of chunk text — never paraphrase source_excerpt.
3. Preserve provenance from source candidate(s). Do not invent dates, actors, or locations not in source_excerpt.
4. Do not create semantic links. Do not enrich from external sources.

CLAIMS: Material propositions only. Clean declarative syntax. No transitional filler ("Trump added a new entry to that list"). No raw quotes as claims unless converted to attributed claim form. Not every sentence is a claim.

EVIDENCE: Direct quotes, statistics, reported facts, document refs, context. quote = attributed speech only. Do not duplicate stats already captured as evidence into claims.

EVENTS: public_statement, aggregate_event, military_action, etc. with actor/action/object/timeframe when available. Public statements and enumerated action groups belong here.

POSITIONS: Normalized article/author stance — synthesize central thesis, do not copy verbatim unless already ideal. Prefer 1–2 positions, not every evaluative phrase.

MATERIALITY TARGETS (guidance, not hard limits): ~6–12 claims, ~8–18 evidence, ~1–4 events, ~1–2 positions for analytical news chunks.

span_start/span_end: set to 0 — server recomputes from source_excerpt.`;

export const CHUNK_VALIDATE_SYSTEM = `You are the Extraction Validator Agent for Doxa.

Production gate for standardized atoms + provenance. Strict. Do not repair.

${METADATA_PROMPT_BLOCK}

Pass only if: no blocking hallucinations, valid provenance, correct taxonomy, materiality appropriate, deduplicated, standardized syntax, core story content captured, central author/article position when present.

Check: schema validity, provenance validity, atom taxonomy, materiality, deduplication, standardized syntax, no unsupported story-sourced fields, no semantic links, completeness for downstream canonicalization.

Do NOT require: claim_evidence_links or relationship coverage.
Do NOT flag span_start/span_end — server-computed from source_excerpt.

On failure: emit blocking_issues with issue_type, entity_type, entity_index, description, acceptance_criteria. Set recommended_next_agent to refiner when fixable; human_review when not.

Set passes=true and recommended_status passed when production-ready. needs_refinement when fixable major issues remain. needs_human_review when blocking issues cannot be fixed by refiner.

Score taxonomy_quality and materiality (0–1) in addition to grounding/provenance scores.`;

export const MERGE_REVIEW_SYSTEM = `You are the Extraction Review Agent for Doxa at story merge level.

Compare full article text to merged extraction JSON. Report findings only; do not rewrite.

${METADATA_PROMPT_BLOCK}

Focus on: missing central article position, merge drift vs chunk content, duplicates, aggregate vs atomic events, broken links, temporal grounding.

Treat deterministic_issues as pre-confirmed blocking. Do not flag supported paraphrases as hallucinations.`;

export const MERGE_VALIDATE_SYSTEM = `You judge merged story extraction for Doxa. Include merge_fidelity in scores (0-1).

${METADATA_PROMPT_BLOCK}

Set passes=true only when story-level extraction is production-ready for canonicalization. Deterministic pre-checks have already passed.`;

export const CHUNK_REFINE_SYSTEM = `You are the Extraction Refiner Agent for Doxa.

Repair standardized atoms based on validator blocking_issues. Not a fresh extractor or standardizer.

${METADATA_PROMPT_BLOCK}

RULES:
1. Apply validation_report blocking_issues — each has acceptance_criteria describing the fix.
2. Do NOT re-decide taxonomy unless issue_type is bad_atom_type.
3. Fill missing fields, fix incomplete events, normalize timeframes, improve claim/position wording using article context only.
4. When adding/updating atoms, source_excerpt must be exact chunk wording. Do not invent dates, locations, actors, or relationships.
5. Output patches only: add, remove, update on claims/evidence/positions/events — never link or unlink.
6. Do not create semantic link arrays.
7. Do not patch span_start or span_end — pipeline recomputes from source_excerpt.
8. List ignored_findings when validator incorrectly flagged supported content.`;

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

function normalizePositionsReviewReport(raw: PositionsReviewReport): PositionsReviewReport {
  const action = raw.recommended_action;
  const normalizedAction =
    action === "validate"
      ? "validate"
      : action === "needs_refinement"
        ? "needs_refinement"
        : action === "reject"
          ? "reject"
          : "needs_refinement";
  return {
    ...raw,
    recommended_action: normalizedAction,
    issues: (raw.issues ?? []).map((issue) => ({
      ...issue,
      position_id: issue.position_id ?? null,
      position_index: issue.position_index ?? null,
    })),
    patches: (raw.patches ?? []).map((patch) => ({
      ...patch,
      entity_type: "position",
      position_ids: patch.position_ids ?? [],
      position_indexes: patch.position_indexes ?? [],
      recommended_raw_text: patch.recommended_raw_text ?? null,
    })),
  };
}

function normalizeClaimsReviewReport(raw: ClaimsReviewReport): ClaimsReviewReport {
  const action = raw.recommended_action;
  const normalizedAction =
    action === "validate"
      ? "validate"
      : action === "needs_refinement"
        ? "needs_refinement"
        : action === "reject"
          ? "reject"
          : "needs_refinement";
  return {
    ...raw,
    recommended_action: normalizedAction,
    issues: (raw.issues ?? []).map((issue) => ({
      ...issue,
      claim_id: issue.claim_id ?? null,
      claim_index: issue.claim_index ?? null,
    })),
    patches: (raw.patches ?? []).map((patch) => ({
      ...patch,
      entity_type: "claim",
      claim_ids: patch.claim_ids ?? [],
      claim_indexes: patch.claim_indexes ?? [],
      recommended_raw_text: patch.recommended_raw_text ?? null,
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
  const stripSpanIssues = (items: string[]) =>
    items.filter((issue) => !issue.includes("span_mismatch") && !issue.includes("span_excerpt"));
  const blocking = normalizeBlockingIssues(raw.blocking_issues).filter(
    (issue) =>
      !issue.description.includes("span_mismatch") && !issue.description.includes("span_excerpt")
  );
  return {
    ...raw,
    recommended_status: status,
    scores,
    blocking_issues: blocking,
    major_issues: stripSpanIssues(raw.major_issues ?? []),
  };
}

export type StandardizeChunkResult = {
  claims: unknown[];
  evidence: unknown[];
  positions: unknown[];
  events: unknown[];
  standardization_report: StandardizationReport;
};

export async function standardizeChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<StandardizeChunkResult> {
  return callOpenAIJson<StandardizeChunkResult>(
    apiKey,
    model,
    CHUNK_STANDARDIZE_SYSTEM,
    payload,
    "doxa_chunk_standardize",
    STANDARDIZE_JSON_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
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

export async function reviewChunkClaims(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string,
  responseSchema?: {
    schema: Record<string, unknown>;
    schemaName?: string;
    normalize?: boolean;
  }
): Promise<ClaimsReviewReport> {
  const schema = responseSchema?.schema ?? (CLAIMS_REVIEW_SCHEMA as unknown as Record<string, unknown>);
  const schemaName = responseSchema?.schemaName ?? "doxa_chunk_claims_review";
  const shouldNormalize = responseSchema?.normalize ?? !responseSchema?.schema;

  const raw = await callOpenAIJson<ClaimsReviewReport>(
    apiKey,
    model,
    systemPrompt,
    payload,
    schemaName,
    schema,
    requestId
  );
  const report = shouldNormalize ? normalizeClaimsReviewReport(raw) : (raw as ClaimsReviewReport);
  const payloadObj = payload as { deterministic_issues?: string[] };
  if (payloadObj.deterministic_issues?.length) {
    report.deterministic_issues = payloadObj.deterministic_issues;
  }
  return report;
}

export async function refineChunkClaims(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string
): Promise<RefinementPatchResult> {
  const result = await callOpenAIJson<RefinementPatchResult>(
    apiKey,
    model,
    systemPrompt,
    payload,
    "doxa_chunk_claims_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId,
    false
  );
  result.patches = (result.patches ?? []).filter(
    (p) => p.op !== "link" && p.op !== "unlink" && p.entity_type === "claim"
  );
  return result;
}

export async function reviewChunkPositions(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string,
  responseSchema?: {
    schema: Record<string, unknown>;
    schemaName?: string;
    normalize?: boolean;
  }
): Promise<PositionsReviewReport> {
  const schema = responseSchema?.schema ?? (POSITIONS_REVIEW_SCHEMA as unknown as Record<string, unknown>);
  const schemaName = responseSchema?.schemaName ?? "doxa_chunk_positions_review";
  const shouldNormalize = responseSchema?.normalize ?? !responseSchema?.schema;

  const raw = await callOpenAIJson<PositionsReviewReport>(
    apiKey,
    model,
    systemPrompt,
    payload,
    schemaName,
    schema,
    requestId
  );
  const report = shouldNormalize ? normalizePositionsReviewReport(raw) : (raw as PositionsReviewReport);
  const payloadObj = payload as { deterministic_issues?: string[] };
  if (payloadObj.deterministic_issues?.length) {
    report.deterministic_issues = payloadObj.deterministic_issues;
  }
  return report;
}

export async function refineChunkPositions(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string
): Promise<RefinementPatchResult> {
  const result = await callOpenAIJson<RefinementPatchResult>(
    apiKey,
    model,
    systemPrompt,
    payload,
    "doxa_chunk_positions_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId,
    false
  );
  result.patches = (result.patches ?? []).filter(
    (p) => p.op !== "link" && p.op !== "unlink" && p.entity_type === "position"
  );
  return result;
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
    CHUNK_VALIDATION_SCHEMA as unknown as Record<string, unknown>,
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

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (extract-story-claims). */
export const EXTRACT_CLAIMS_SYSTEM_PROMPT = `You are the Doxa Primary Claim Extractor.

Your task is to read one story chunk and extract only the primary factual claims that are useful for a discourse knowledge graph.

A primary claim is a standalone factual assertion that:
1. can be understood without needing the surrounding article,
2. materially changes the reader's understanding of the story,
3. could be supported, contradicted, updated, refined, or reused by another story,
4. has a clear subject, assertion, and natural-language temporal scope,
5. is not merely a caveat, hedge, quote, evidence snippet, transition, rhetorical flourish, minor detail, or article framing.

Extract claims only from the provided text. Do not use outside knowledge. Do not invent missing facts. Do not extract positions, opinions, recommendations, moral judgments, events as standalone event records, evidence excerpts, quotes as quotes, or generic background.

Every raw_text must be a complete standalone sentence with explicit temporal scope when the story involves time (use published_at as the "as of" anchor for cumulative claims when the chunk does not provide a more specific date).

Prefer fewer, stronger claims over many weak claims. Aim for 1–4 primary claims per chunk. Return more only if the chunk contains multiple distinct factual arguments or datasets.

Do not extract statements that primarily function as qualifiers, caveats, hedges, scope limitations, author framing, article transitions, or supporting details that only matter because of a parent claim.

Preserve attribution inside the claim text when the claim is presented as someone's assertion, allegation, estimate, report, warning, or finding.

Return JSON with claims array only; each item has raw_text.`;

export function buildExtractClaimsUserPayload(metadata: Record<string, unknown>, chunkText: string) {
  return {
    story_id: metadata.story_id,
    title: metadata.title,
    source_name: metadata.source_name,
    published_at: metadata.published_at,
    chunk_text: chunkText,
  };
}

export function buildExtractPositionsUserPayload(
  metadata: Record<string, unknown>,
  chunkText: string,
  existingClaims?: unknown[]
) {
  return {
    story_id: metadata.story_id,
    chunk_id: metadata.chunk_index,
    published_at: metadata.published_at,
    source_name: metadata.source_name,
    chunk_text: chunkText,
    ...(Array.isArray(existingClaims) && existingClaims.length > 0
      ? { existing_claims: existingClaims }
      : {}),
  };
}

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (extract-story-positions). */
export const EXTRACT_POSITIONS_SYSTEM_PROMPT = `You are the Position Extraction Agent for Doxa.

Your job is to extract the source's positions from one story chunk. A position is a source-level stance, thesis, opinion, judgment, recommendation, warning, conclusion, or implied viewpoint that the source is trying to express, advance, endorse, criticize, or persuade the reader to accept.

Positions are different from ordinary claims because they represent what the source appears to believe, advocate, imply, oppose, prioritize, or want the reader to conclude. Overlap with claims is allowed when a statement functions as part of the source's stance.

Use only the provided chunk text. Do not use outside knowledge.

Extract all meaningful positions expressed or implied by the source in this chunk. Do not extract weak, speculative, or unsupported implied positions.

Every position must include provenance with supporting_spans from the chunk. For implicit positions include 2+ supporting spans when possible and inference_rationale.

Use published_at as the default temporal anchor when the chunk does not provide a more specific date.

Write each position as a clear standalone sentence in standardized_position_text.

Prefer precision over recall. If no positions are present, return an empty positions array.

Return JSON with positions array only using the required schema fields.`;

export const MERGE_CLAIMS_SYSTEM_PROMPT = `You merge chunk-level primary claims into one deduplicated story-level claims array for DOXA.

${METADATA_PROMPT_BLOCK}

Given multiple chunk claim arrays:
1) Deduplicate overlapping claims; keep the most specific standalone wording grounded in chunk content.
2) Preserve temporal scope and attribution in claim text.
3) Do not invent facts. Do not add evidence, positions, or events.
4) Target 3–10 primary claims for a typical story after merge.

Return JSON: claims array with raw_text, polarity (asserts|denies|uncertain), stance (support|oppose|neutral), extraction_confidence.`;

export const MERGE_POSITIONS_SYSTEM_PROMPT = `You merge chunk-level positions into one deduplicated story-level positions array for DOXA.

${METADATA_PROMPT_BLOCK}

Given multiple chunk position arrays:
1) Deduplicate overlapping stances; keep the most precise standalone wording grounded in chunk content.
2) Preserve attribution and signal_type semantics in position text and metadata.
3) Do not invent facts. Do not add claims or evidence.
4) Target 1–4 central positions for a typical story after merge.

Return JSON: positions array with raw_text, extraction_confidence, signal_type, and source_ownership when present.`;

export const EXTRACT_SYSTEM_PROMPT = `You are the Story Extraction Agent for Doxa.

Recall-biased candidate extraction from a single chunk. Find potentially important content. No semantic links. Only chunk text — no outside knowledge.

${METADATA_PROMPT_BLOCK}

YOUR JOB: identify candidate claims, evidence, positions, and events worth downstream review.
Do NOT decide final materiality, dedupe, or production taxonomy — a Standardizer runs next.

PROVENANCE:
- Every atom MUST have source_excerpt: exact verbatim wording from the chunk where grounded.
- span_start/span_end: set to 0 — server recomputes from source_excerpt.

TEMPORAL: Do not invent dates or years not in the chunk. Preserve relative language ("on Wednesday", "this term").

CANDIDATE TYPES (rough classification OK):
- claims: propositions that might be disputed or canonicalized
- evidence: quotes, stats, reported facts, context
- positions: article/author stance or actor views when clearly present
- events: statements, actions, aggregate patterns with actor/action hints

Prefer recall over precision — capture major facts, quotes, stats, threats, stances, and action patterns. Skip obvious section transitions only.

Return JSON: claims, evidence, positions, events — each with source_excerpt and extraction_confidence.`;

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
