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

const CLAIMS_REVIEW_CLAIM_AUDIT_SCHEMA = {
  type: "object",
  properties: {
    claim_id: { type: "string" },
    verdict: { type: "string", enum: ["pass", "needs_repair", "reject_final"] },
    reason: { type: "string" },
  },
  required: ["claim_id", "verdict"],
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
    claim_audit: { type: "array", items: CLAIMS_REVIEW_CLAIM_AUDIT_SCHEMA },
    refinement_instruction: { type: "string" },
  },
  required: [
    "passes_review",
    "recommended_action",
    "summary",
    "issues",
    "patches",
    "claim_audit",
    "refinement_instruction",
  ],
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

const POSITION_PATCH_OBJECT_SCHEMA = {
  type: ["object", "null"],
  properties: {
    ...PATCH_OBJECT_SCHEMA.properties,
    position_id: { type: ["string", "null"] },
    signal_type: { type: ["string", "null"] },
    signal_strength: { type: ["number", "null"] },
    attributed_actor: { type: ["string", "null"] },
    source_endorses_attributed_position: {
      type: ["string", "null"],
      enum: ["yes", "no", "unclear", "not_applicable", null],
    },
    is_source_position: { type: ["boolean", "null"] },
    is_attributed_to_other_actor: { type: ["boolean", "null"] },
    stance_target: { type: ["string", "null"] },
    stance_action: { type: ["string", "null"] },
    stance_polarity: { type: ["string", "null"] },
    scope: { type: ["string", "null"] },
    jurisdiction: { type: ["string", "null"] },
    timeframe: { type: ["string", "null"] },
    modality: { type: ["string", "null"] },
    inference_rationale: { type: ["string", "null"] },
  },
  required: [
    ...PATCH_OBJECT_SCHEMA.required,
    "position_id",
    "signal_type",
    "signal_strength",
    "attributed_actor",
    "source_endorses_attributed_position",
    "is_source_position",
    "is_attributed_to_other_actor",
    "stance_target",
    "stance_action",
    "stance_polarity",
    "scope",
    "jurisdiction",
    "timeframe",
    "modality",
    "inference_rationale",
  ],
  additionalProperties: false,
} as const;

export const CLAIMS_REFINE_REPLACEMENT_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim_id: { type: "string" },
          raw_text: { type: "string" },
          polarity: { type: "string", enum: ["asserts", "denies", "uncertain"] },
          stance: { type: "string", enum: ["support", "oppose", "neutral"] },
          span_start: { type: "integer" },
          span_end: { type: "integer" },
          source_excerpt: { type: "string" },
          source_story_id: { type: "string" },
          source_chunk_index: { type: "integer" },
          extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "claim_id",
          "raw_text",
          "polarity",
          "stance",
          "span_start",
          "span_end",
          "source_excerpt",
          "source_story_id",
          "source_chunk_index",
          "extraction_confidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

export const CLAIMS_APPROVAL_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim_id: { type: "string" },
          approved: { type: "boolean" },
          reason: { type: "string" },
          fixable: { type: "boolean" },
        },
        required: ["claim_id", "approved", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

export const POSITION_REFINE_PATCH_SCHEMA = {
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
          value: POSITION_PATCH_OBJECT_SCHEMA,
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

INPUT: chunk_text and extraction_json.claims (each claim has raw_text, source_excerpt, span_start, span_end).

EVALUATE:
1. Claim grounding — raw_text must be supported by chunk_text. Do not use outside knowledge.
2. Span/excerpt grounding — source_excerpt and spans must point to text that supports the claim. If raw_text is supported elsewhere in the chunk but source_excerpt points to unrelated text, use issue_type span_grounding_mismatch (blocking), not grounding. The refiner fixes excerpt/spans; do not reject the claim as unsupported when only the citation is wrong.
3. Materiality — missing major factual claims visible in the chunk (major severity).
4. Temporal accuracy — dates/years/timeframes in claim text must appear in or be clearly anchored by the chunk (blocking if invented).
5. Claim quality — standalone sentences, not quotes-as-claims, not rhetorical filler, not duplicate/over-merged claims.
6. Count — aim for 1–4 primary claims; flag excess weak claims (major).

ISSUE TYPES (use exactly one per issue): grounding, span_grounding_mismatch, attribution, materiality, duplicate, over_merged, under_split, temporal, quote_like, missing_claim, schema_issue.

SEVERITY:
- blocking — unsupported factual assertion, invented date, span_grounding_mismatch, claim not a complete sentence
- major — missing important claim, duplicate, weak/non-material claim, bad attribution
- minor — wording polish, confidence, style that does not change meaning, attribution, or material completeness

RECOMMENDED_ACTION:
- validate — production-ready for merge (passes_review=true)
- needs_refinement — fixable blocking/major issues including span/excerpt corrections (passes_review=false)
- reject — serious ambiguity or unfixable issues requiring human judgment only when the refiner cannot safely resolve (passes_review=false)

RULES:
1. Treat deterministic_issues as pre-confirmed facts (do not re-litigate). span_grounding_mismatch and attribution_drift entries are actionable — route to needs_refinement with matching issue_type.
2. Ignore span_mismatch entries in deterministic_issues (server recomputes offsets from source_excerpt).
3. Recommend add/remove/update patches on claims only — entity_type must be "claim".
4. Wording or canonicalization alone is minor unless it changes meaning, attribution, or material completeness.
5. Write summary as 2–4 sentences synthesizing all issues (deterministic + your findings).
6. claim_audit: pass | needs_repair | reject_final per claim_id, consistent with issues.`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (refine-chunk-claims). */
export const CHUNK_CLAIMS_REFINE_SYSTEM = `You are the K-Claims Refiner Agent for Doxa.

Revise only the claims in repair_queue using the prior claim version and Review K-Claims feedback.

Output a complete replacement claims JSON for the repair subset only. No commentary or markdown.

Rules:
1. Preserve valid claims unless review requires change.
2. Apply review issues, claim_audit, and refinement_instruction exactly.
3. Do not invent claims — only include claims supported by chunk text.
4. Fix grounding: accurate span_start, span_end, source_excerpt in chunk text. For span_grounding_mismatch issues, correct the excerpt/spans to verbatim supporting text or remove the claim if unsupported.
5. Preserve stable claim_id when the claim remains substantively the same.
6. Include all required extractor fields on every claim.
7. Do not mark output as reviewed or passed.`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (approve-chunk-claims). */
export const CHUNK_CLAIMS_APPROVE_SYSTEM = `You are the K-Claims Approval Agent for Doxa.

For each claim in the input list, decide approve or reject for merge eligibility.

Rules:
1. Approve only claims faithful to chunk text and merge-worthy.
2. Do not rewrite claim text — verdict only.
3. Reject hallucinations, vague summaries, duplicates of better claims, and ungrounded rows.
4. Set fixable=true when rejection could be fixed by another repair pass; fixable=false when unfixable.
5. Output one verdict per input claim_id.`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (validate-chunk-positions). */
export const CHUNK_POSITIONS_REVIEW_SYSTEM = `You are the Doxa Position Review Agent.

Audit one story chunk's position extraction output. Review positions_extraction_json.positions only. Do not rewrite positions in place — report findings and patches only.

A position is a standalone viewpoint, stance, thesis, judgment, recommendation, warning, criticism, endorsement, conclusion, or implied belief that someone in the chunk expresses or that the article/source clearly advances, implies, criticizes, or wants the reader to conclude.

Use only chunk_text and positions_extraction_json.positions. Do not use outside knowledge.

${METADATA_PROMPT_BLOCK}

INPUTS: story_id, chunk_index, published_at, source_name, chunk_text, optional existing_claims, positions_extraction_json.positions, deterministic_issues, materiality_warnings, attempt_number.

Each position may include: position_id, raw_text, signal_type, signal_strength, extraction_confidence, holder (article | author | quoted_actor | null), source_ownership (is_source_position, is_attributed_to_other_actor, attributed_actor, source_endorses_attributed_position), provenance (supporting_spans, inference_rationale), stance_signature, source_excerpt, related_claim_ids, notes.

Judge attribution via source_ownership and attributed_actor — not a separate reported_actor field. Paraphrased vs quoted actors both use is_attributed_to_other_actor with attributed_actor set.

EVALUATE:

1. Position validity (issue_type: materiality)
Every extracted item must be a real position, not merely a neutral factual/procedural claim.
Valid: policy preferences, reforms, endorsements/criticisms, warnings, institutional judgments, recommendations, actor reactions that express a stance.
Invalid: neutral procedural facts, standalone facts with no viewpoint function, background, transitions, event/evidence records, quotes merely as quotes, duplicative restatements.

2. Grounding (issue_type: grounding)
Every position must be supported by chunk_text. Do not add facts, motives, actors, targets, scope, or conclusions the chunk does not support.
Check raw_text, supporting spans, and inference_rationale. Flag unsupported or overstated inference (implicit_overreach when weak implied stance).

3. Holder accuracy (issue_type: attribution)
holder and source_ownership must identify the correct holder.
Flag: reported actor treated as article stance; quoted actor labeled article; attributed_actor not supported by spans; group statement assigned to one individual; multiple actors collapsed into one holder.

4. Signal type accuracy (issue_type: implicit_overreach or schema_issue)
signal_type must be explicit, implicit, attributed, or opposed.
Flag: opposed used only because it is an opposing viewpoint in the article; attributed explicit quote mislabeled opposed; implied labeled explicit without direct support; explicit mislabeled implicit; position inferred from weak neutral facts.

5. Source ownership (issue_type: stance_flattening)
is_source_position=true only when the article/source clearly advances, implies, endorses, criticizes, or concludes the position in its own narrative voice.
is_attributed_to_other_actor=true when the position belongs to a quoted/reported actor. attributed_actor must be a real name or null — never the string "null".
source_endorses_attributed_position: not_applicable when not attributed; default unclear for attributed positions; yes/no only when the article clearly endorses or rejects in its own voice. Do not treat quote inclusion or placement as endorsement.

6. Provenance (issue_type: grounding or schema_issue)
Explicit/attributed: one strong direct quote or paraphrase span supporting position and holder.
Implicit: usually 2+ supporting spans; inference_rationale must explain how spans collectively imply the position.
Flag missing, weak, irrelevant, or mismatched spans; span_text that does not support the position; misleading span_role; unsupported inference_rationale.

7. Stance signature (issue_type: schema_issue)
stance_signature should support later canonicalization: specific stance_target; meaningful stance_action (not vague suggest/indicate/comment/discuss when shrink/remove/defend/criticize/warn_against etc. fit); correct stance_polarity, scope, jurisdiction, timeframe, modality.

8. Missing positions (issue_type: missing_position)
Flag major positions clearly supported in the chunk but not extracted. Do not require every minor opinion or repeated version of an already extracted stance.

9. Duplicates and over-split (issue_type: duplicate, over_merged, or under_split)
Split when holders, targets, stance directions, scopes, or attribution differ. Do not split trivial fragments of the same stance.

10. Confidence (issue_type: schema_issue)
signal_strength and extraction_confidence should match evidence strength. Flag weak implied positions scored too high, explicit positions too low, unsupported high confidence, or uniform 1.0 scores.

11. Temporal accuracy (issue_type: temporal)
Timeframes in position text or stance_signature must appear in or be anchored by chunk_text. Blocking if invented.

DO NOT review: claims, evidence, events, links, span_start, span_end.

SEVERITY:
- blocking — unsupported stance, invented date, attribution flattened, implicit position from single vague sentence, serious provenance failure
- major — missing material position, duplicate, weak/non-material position, bad attribution or source ownership, weak implicit inference
- minor — wording, confidence tuning, signature field polish

ISSUE TYPES (use exactly one per issue): grounding, attribution, materiality, duplicate, over_merged, under_split, temporal, implicit_overreach, stance_flattening, missing_position, schema_issue.

OUTPUT: strict JSON matching the required schema. No markdown.

{
  "passes_review": true,
  "recommended_action": "validate",
  "summary": "",
  "issues": [
    {
      "severity": "blocking",
      "position_id": null,
      "position_index": null,
      "issue_type": "grounding",
      "finding": ""
    }
  ],
  "patches": [
    {
      "action": "update",
      "entity_type": "position",
      "severity": "major",
      "position_ids": [],
      "position_indexes": [],
      "recommended_raw_text": null,
      "reason": "",
      "source_grounding": ""
    }
  ]
}

RECOMMENDED_ACTION:
- validate — materially correct; only trivial or optional improvements (passes_review=true)
- needs_refinement — fixable holder, ownership, signature, overreach, duplicate, or missing material position issues (passes_review=false)
- reject — serious ambiguity, unsupported inferred positions, major attribution uncertainty requiring human judgment (passes_review=false)

PATCHES:
1. Provide patches for every fixable blocking and major issue. entity_type must be "position".
2. add — missing material positions (recommended_raw_text = complete standalone sentence)
3. remove — invalid or unsupported positions
4. update — fix text, holder, signal_type, or source_ownership fields (recommended_raw_text when text changes)
5. merge — duplicate positions (position_ids / position_indexes for all involved)
6. split — over-merged positions
7. source_grounding must quote or paraphrase chunk_text.

RULES:
1. Treat deterministic_issues as pre-confirmed blocking facts (do not re-litigate). Entries may be JSON with position_id, position_index, position_number, field_path, bad_value, recommended_value.
2. Ignore span_mismatch entries in deterministic_issues.
3. Set passes_review=true and recommended_action=validate only when production-ready for merge.
4. Write summary as 2–4 sentences synthesizing deterministic issues and your findings.
5. Be strict about attribution and source ownership. Be cautious with implicit positions. Prefer precision over recall.`;

/** @deprecated Seed-only — runtime source of truth is agent_prompt_versions (refine-chunk-positions). */
export const CHUNK_POSITIONS_REFINE_SYSTEM = `You are the Doxa Position Refinement Agent.

Apply targeted patches to fix reviewer findings on one chunk's positions array. Not a fresh extractor.

${METADATA_PROMPT_BLOCK}

INPUTS: story_id, chunk_index, published_at, source_name, chunk_text, positions_extraction_json.positions (already includes server-applied review_plan patches), review_report (issues, patches, deterministic_issues, summary), validation_report (latest review pass: passes, recommended_status, attempt_number, summary).

Each position may include: position_id, raw_text, signal_type, holder, source_ownership, provenance, stance_signature, source_excerpt, extraction_confidence.

PRIORITY:
1. Read validation_report first — it is the latest review pass outcome (passes, recommended_status, attempt_number, deterministic_issues). When passes=false, every blocking/major issue must be fixed.
2. positions_extraction_json already includes server-applied review_plan patches from review_report.patches and deterministic_issues; finish remaining fixes only.
3. Apply review_report.issues — especially blocking and major severity.
4. Apply review_report.deterministic_issues — treat as pre-confirmed blocking facts. Entries may be JSON with position_id, position_index, position_number, field_path, bad_value, recommended_value. Use position_id to resolve the correct row when indexes differ.

FIX TYPES:
- source_ownership / stance_flattening: set is_source_position, is_attributed_to_other_actor, attributed_actor, source_endorses_attributed_position (default attributed positions to unclear unless chunk clearly endorses/rejects).
- attribution / holder: set holder and ownership fields consistently.
- schema_issue / stance_signature: update stance_target, stance_action, stance_polarity, scope, jurisdiction, timeframe, modality — use specific canonical actions (warn_against, criticize, defend, shrink) not vague suggest/indicate/comment.
- grounding / provenance_not_verbatim: set source_excerpt to a verbatim substring from chunk_text; use recommended_value from deterministic issue when provided.
- materiality / implicit_overreach: remove invalid positions or tighten raw_text and signal_type.
- missing_position: add with full grounded fields.
- duplicate / merge: remove duplicates or update one survivor.

PATCH RULES:
1. Output patches only — never rewrite the full positions array. entity_type must be "position".
2. Ops: add, remove, update only — never link/unlink.
3. Prefer position_id in value when known; entity_index is 0-based array index.
4. On update, include only fields that change. raw_text must remain a complete standalone sentence grounded in chunk_text.
5. Do not invent dates, actors, targets, or facts not in chunk_text.
6. Do not patch span_start or span_end — pipeline recomputes from source_excerpt.
7. Minimal changes only. List ignored_findings when a reviewer flag was wrong.
8. For holder quoted_actor or reported_actor, set source_endorses_attributed_position to unclear unless chunk_text clearly shows the article endorses or rejects the attributed position in its own voice.

OUTPUT: strict JSON only.

{
  "patches": [
    {
      "op": "update",
      "entity_type": "position",
      "entity_index": 0,
      "value": {
        "position_id": null,
        "raw_text": null,
        "source_excerpt": null,
        "holder": null,
        "signal_type": null,
        "source_endorses_attributed_position": "unclear",
        "stance_action": null
      }
    }
  ],
  "ignored_findings": []
}

Set unused value fields to null.`;

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
    claim_audit: (raw.claim_audit ?? []).map((row) => ({
      claim_id: row.claim_id,
      verdict: row.verdict,
      ...(row.reason ? { reason: row.reason } : {}),
    })),
    refinement_instruction: raw.refinement_instruction ?? "",
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
  },
  timeoutMs?: number
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
    requestId,
    true,
    timeoutMs
  );
  const report = shouldNormalize ? normalizeClaimsReviewReport(raw) : (raw as ClaimsReviewReport);
  const payloadObj = payload as { deterministic_issues?: string[] };
  if (payloadObj.deterministic_issues?.length) {
    report.deterministic_issues = payloadObj.deterministic_issues;
  }
  return report;
}

export async function refineChunkClaimsReplacement(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string,
  responseSchema?: {
    schema: Record<string, unknown>;
    schemaName?: string;
  },
  timeoutMs?: number
): Promise<{ claims: unknown[] }> {
  const schema =
    responseSchema?.schema ?? (CLAIMS_REFINE_REPLACEMENT_SCHEMA as unknown as Record<string, unknown>);
  const schemaName = responseSchema?.schemaName ?? "doxa_chunk_claims_refine";
  const result = await callOpenAIJson<{ claims?: unknown[] }>(
    apiKey,
    model,
    systemPrompt,
    payload,
    schemaName,
    schema,
    requestId,
    true,
    timeoutMs
  );
  return { claims: Array.isArray(result?.claims) ? result.claims : [] };
}

export type ClaimsApprovalResult = {
  verdicts: Array<{
    claim_id: string;
    approved: boolean;
    reason: string;
    fixable?: boolean;
  }>;
};

export async function approveChunkClaims(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string,
  responseSchema?: {
    schema: Record<string, unknown>;
    schemaName?: string;
  },
  timeoutMs?: number
): Promise<ClaimsApprovalResult> {
  const schema =
    responseSchema?.schema ?? (CLAIMS_APPROVAL_SCHEMA as unknown as Record<string, unknown>);
  const schemaName = responseSchema?.schemaName ?? "doxa_chunk_claims_approve";
  const result = await callOpenAIJson<ClaimsApprovalResult>(
    apiKey,
    model,
    systemPrompt,
    payload,
    schemaName,
    schema,
    requestId,
    true,
    timeoutMs
  );
  return {
    verdicts: Array.isArray(result?.verdicts) ? result.verdicts : [],
  };
}

export async function refineChunkClaims(
  apiKey: string,
  model: string,
  systemPrompt: string,
  payload: unknown,
  requestId: string,
  timeoutMs?: number
): Promise<RefinementPatchResult> {
  const result = await callOpenAIJson<RefinementPatchResult>(
    apiKey,
    model,
    systemPrompt,
    payload,
    "doxa_chunk_claims_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId,
    false,
    timeoutMs
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
    POSITION_REFINE_PATCH_SCHEMA as unknown as Record<string, unknown>,
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
  supabase: {
    from: (t: string) => {
      insert: (r: unknown) => {
        select: (cols: string) => { single: () => Promise<{ data: { id?: string } | null; error: { message: string } | null }> };
      };
    };
  },
  row: {
    story_id: string;
    chunk_index?: number | null;
    stage: string;
    input_snapshot?: unknown;
    output_snapshot?: unknown;
    report?: unknown;
    run_id?: string | null;
    claim_version_id?: string | null;
    input_claim_version_id?: string | null;
    output_claim_version_id?: string | null;
  }
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  return supabase
    .from("story_extraction_qa_artifacts")
    .insert(row)
    .select("id")
    .single() as Promise<{ data: { id: string } | null; error: { message: string } | null }>;
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
