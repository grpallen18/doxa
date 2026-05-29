import type { ReviewReport, ValidationReport } from "./types.ts";

const DEFAULT_MODEL = "gpt-4o-mini";

export async function callOpenAIJson<T>(
  apiKey: string,
  model: string,
  system: string,
  userPayload: unknown,
  schemaName: string,
  schema: Record<string, unknown>,
  requestId: string
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
        json_schema: { name: schemaName, strict: true, schema },
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

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          severity: { type: "string", enum: ["blocking", "warning"] },
          description: { type: "string" },
          entity_type: { type: ["string", "null"] },
          entity_index: { type: ["integer", "null"] },
        },
        required: ["type", "severity", "description", "entity_type", "entity_index"],
        additionalProperties: false,
      },
    },
    recommended_action: { type: "string", enum: ["refine", "validate", "human_review"] },
  },
  required: ["findings", "recommended_action"],
  additionalProperties: false,
} as const;

export const VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    passes: { type: "boolean" },
    scores: {
      type: "object",
      properties: {
        grounding: { type: "number", minimum: 0, maximum: 1 },
        completeness: { type: "number", minimum: 0, maximum: 1 },
        granularity: { type: "number", minimum: 0, maximum: 1 },
        link_quality: { type: "number", minimum: 0, maximum: 1 },
        temporal_accuracy: { type: "number", minimum: 0, maximum: 1 },
        merge_fidelity: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["grounding", "completeness", "granularity", "link_quality", "temporal_accuracy"],
      additionalProperties: false,
    },
    blocking_issues: { type: "array", items: { type: "string" } },
    recommended_status: {
      type: "string",
      enum: ["passed", "needs_refinement", "needs_human_review"],
    },
  },
  required: ["passes", "scores", "blocking_issues", "recommended_status"],
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
          op: { type: "string", enum: ["add", "remove", "update"] },
          entity_type: { type: "string" },
          entity_index: { type: ["integer", "null"] },
          value: { type: ["object", "null"] },
        },
        required: ["op", "entity_type", "entity_index", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["patches"],
  additionalProperties: false,
} as const;

export const CHUNK_REVIEW_SYSTEM = `You review chunk-level story extraction for DOXA quality. Compare source segment text to extraction JSON.
Identify: missing claims/evidence/positions/events, hallucinated items, duplicates, bad granularity, weak links.
Do NOT rewrite extraction — only report findings. Use recommended_action refine when blocking issues exist and are fixable; validate when clean; human_review when ambiguous.`;

export const CHUNK_VALIDATE_SYSTEM = `You judge chunk-level extraction quality for DOXA. Score grounding, completeness, granularity, link_quality, temporal_accuracy (0-1).
Set passes=true only when grounded in the segment with no invented dates and no orphan entities. blocking_issues must be specific strings.`;

export const MERGE_REVIEW_SYSTEM = `You review merged story-level extraction for DOXA. Compare full article to merged entities.
Focus on: missing central article position, merge drift vs chunk content, duplicates, aggregate vs atomic events, broken links.
Report findings only; do not rewrite.`;

export const MERGE_VALIDATE_SYSTEM = `You judge merged story extraction for DOXA. Include merge_fidelity score (0-1) comparing merged output to article.
Set passes=true only when story-level extraction is production-ready for canonicalization.`;

export const CHUNK_REFINE_SYSTEM = `You apply targeted patches to chunk extraction JSON based on reviewer findings. Output patches only (add/remove/update). Do not rewrite entire extraction.`;

export const MERGE_REFINE_SYSTEM = `You apply targeted patches to merged story extraction based on reviewer findings. Output patches to claims/evidence/positions/events arrays. Minimal changes only.`;

export async function reviewChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ReviewReport> {
  return callOpenAIJson<ReviewReport>(
    apiKey,
    model,
    CHUNK_REVIEW_SYSTEM,
    payload,
    "doxa_chunk_review",
    REVIEW_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
}

export async function validateChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ValidationReport> {
  return callOpenAIJson<ValidationReport>(
    apiKey,
    model,
    CHUNK_VALIDATE_SYSTEM,
    payload,
    "doxa_chunk_validate",
    VALIDATION_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
}

export async function refineChunk(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<{ patches: Array<{ op: string; entity_type: string; entity_index: number | null; value: Record<string, unknown> | null }> }> {
  return callOpenAIJson(
    apiKey,
    model,
    CHUNK_REFINE_SYSTEM,
    payload,
    "doxa_chunk_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
}

export async function reviewMerged(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<ReviewReport> {
  return callOpenAIJson<ReviewReport>(
    apiKey,
    model,
    MERGE_REVIEW_SYSTEM,
    payload,
    "doxa_merge_review",
    REVIEW_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
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
          "link_quality",
          "temporal_accuracy",
          "merge_fidelity",
        ],
      },
    },
  };
  return callOpenAIJson<ValidationReport>(
    apiKey,
    model,
    MERGE_VALIDATE_SYSTEM,
    payload,
    "doxa_merge_validate",
    schema as unknown as Record<string, unknown>,
    requestId
  );
}

export async function refineMerged(
  apiKey: string,
  model: string,
  payload: unknown,
  requestId: string
): Promise<{ patches: Array<{ op: string; entity_type: string; entity_index: number | null; value: Record<string, unknown> | null }> }> {
  return callOpenAIJson(
    apiKey,
    model,
    MERGE_REFINE_SYSTEM,
    payload,
    "doxa_merge_refine",
    PATCH_SCHEMA as unknown as Record<string, unknown>,
    requestId
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
  await supabase.from("story_extraction_qa_artifacts").insert(row);
}
