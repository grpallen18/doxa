import type { ExtractionJson } from "./types.ts";
import { LINK_ARRAY_KEYS } from "./types.ts";

export type ProvenanceFields = {
  source_story_id: string;
  source_chunk_index: number;
  source_excerpt: string;
  span_start: number | null;
  span_end: number | null;
  extraction_confidence: number;
};

export type ExtractedClaim = ProvenanceFields & {
  raw_text: string;
  polarity: "asserts" | "denies" | "questions" | "suggests";
  stance: "support" | "oppose" | "neutral" | "mixed";
};

export type ExtractedEvidence = ProvenanceFields & {
  excerpt: string;
  evidence_type: "quote" | "statistic" | "reported_fact" | "document_reference" | "context" | "other";
  attribution: string | null;
};

export type ExtractedPosition = ProvenanceFields & {
  raw_text: string;
  position_type: "article_stance" | "actor_stance" | "implied_stance";
  holder: "article" | "author" | "quoted_actor" | null;
};

export type ExtractedEvent = ProvenanceFields & {
  event_summary: string;
  event_type:
    | "public_statement"
    | "military_action"
    | "policy_action"
    | "legal_action"
    | "political_action"
    | "aggregate_event"
    | "other";
  primary_actor: string | null;
  action: string | null;
  object: string | null;
  location: string | null;
  event_date: string | null;
  event_timeframe_start: string | null;
  event_timeframe_end: string | null;
};

export type AtomsExtractionJson = {
  claims: ExtractedClaim[];
  evidence: ExtractedEvidence[];
  positions: ExtractedPosition[];
  events: ExtractedEvent[];
};

export type LinkedExtractionJson = AtomsExtractionJson & {
  claim_evidence_links?: unknown[];
  position_claim_links?: unknown[];
  position_evidence_links?: unknown[];
  event_claim_links?: unknown[];
  event_evidence_links?: unknown[];
};

const PROVENANCE_JSON_PROPERTIES = {
  source_excerpt: { type: "string" },
  span_start: { type: ["integer", "null"] },
  span_end: { type: ["integer", "null"] },
  extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
} as const;

const PROVENANCE_REQUIRED = ["source_excerpt", "span_start", "span_end", "extraction_confidence"] as const;

export const EXTRACT_CLAIMS_JSON_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
        },
        required: ["raw_text"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

const EXTRACT_POSITION_STANCE_SIGNATURE_SCHEMA = {
  type: "object",
  properties: {
    stance_target: { type: "string" },
    stance_action: { type: "string" },
    stance_polarity: { type: "string" },
    scope: { type: "string" },
    jurisdiction: { type: "string" },
    timeframe: { type: "string" },
    modality: { type: "string" },
  },
  required: [
    "stance_target",
    "stance_action",
    "stance_polarity",
    "scope",
    "jurisdiction",
    "timeframe",
    "modality",
  ],
  additionalProperties: false,
} as const;

const EXTRACT_POSITION_SPAN_SCHEMA = {
  type: "object",
  properties: {
    span_text: { type: "string" },
    span_role: { type: "string" },
    why_it_matters: { type: "string" },
  },
  required: ["span_text", "span_role", "why_it_matters"],
  additionalProperties: false,
} as const;

export const EXTRACT_POSITIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    positions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_position_text: { type: "string" },
          standardized_position_text: { type: "string" },
          signal_type: { type: "string", enum: ["explicit", "implicit", "attributed", "opposed"] },
          signal_strength: { type: "number" },
          confidence: { type: "number" },
          stance_signature: EXTRACT_POSITION_STANCE_SIGNATURE_SCHEMA,
          is_source_position: { type: "boolean" },
          is_attributed_to_other_actor: { type: "boolean" },
          attributed_actor: { type: ["string", "null"] },
          source_endorses_attributed_position: {
            type: "string",
            enum: ["yes", "no", "unclear", "not_applicable"],
          },
          supporting_spans: { type: "array", items: EXTRACT_POSITION_SPAN_SCHEMA },
          inference_rationale: { type: "string" },
          related_claim_ids: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
        required: [
          "raw_position_text",
          "standardized_position_text",
          "signal_type",
          "signal_strength",
          "confidence",
          "stance_signature",
          "is_source_position",
          "is_attributed_to_other_actor",
          "attributed_actor",
          "source_endorses_attributed_position",
          "supporting_spans",
          "inference_rationale",
          "related_claim_ids",
          "notes",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["positions"],
  additionalProperties: false,
} as const;

export const EXTRACT_ATOMS_JSON_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          polarity: { type: "string", enum: ["asserts", "denies", "questions", "suggests"] },
          stance: { type: "string", enum: ["support", "oppose", "neutral", "mixed"] },
          ...PROVENANCE_JSON_PROPERTIES,
        },
        required: ["raw_text", "polarity", "stance", ...PROVENANCE_REQUIRED],
        additionalProperties: false,
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          excerpt: { type: "string" },
          evidence_type: {
            type: "string",
            enum: ["quote", "statistic", "reported_fact", "document_reference", "context", "other"],
          },
          attribution: { type: ["string", "null"] },
          ...PROVENANCE_JSON_PROPERTIES,
        },
        required: ["excerpt", "evidence_type", "attribution", ...PROVENANCE_REQUIRED],
        additionalProperties: false,
      },
    },
    positions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          position_type: {
            type: "string",
            enum: ["article_stance", "actor_stance", "implied_stance"],
          },
          holder: {
            type: ["string", "null"],
            enum: ["article", "author", "quoted_actor", null],
          },
          ...PROVENANCE_JSON_PROPERTIES,
        },
        required: ["raw_text", "position_type", "holder", ...PROVENANCE_REQUIRED],
        additionalProperties: false,
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          event_summary: { type: "string" },
          event_type: {
            type: "string",
            enum: [
              "public_statement",
              "military_action",
              "policy_action",
              "legal_action",
              "political_action",
              "aggregate_event",
              "other",
            ],
          },
          primary_actor: { type: ["string", "null"] },
          action: { type: ["string", "null"] },
          object: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          event_date: { type: ["string", "null"] },
          event_timeframe_start: { type: ["string", "null"] },
          event_timeframe_end: { type: ["string", "null"] },
          ...PROVENANCE_JSON_PROPERTIES,
        },
        required: [
          "event_summary",
          "event_type",
          "primary_actor",
          "action",
          "object",
          "location",
          "event_date",
          "event_timeframe_start",
          "event_timeframe_end",
          ...PROVENANCE_REQUIRED,
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["claims", "evidence", "positions", "events"],
  additionalProperties: false,
} as const;

const STANDARDIZATION_REPORT_ENTRY_SCHEMA = {
  type: "object",
  properties: {
    entity_type: { type: ["string", "null"] },
    entity_index: { type: ["integer", "null"] },
    description: { type: "string" },
    reason: { type: "string" },
  },
  required: ["entity_type", "entity_index", "description", "reason"],
  additionalProperties: false,
} as const;

export const STANDARDIZE_JSON_SCHEMA = {
  type: "object",
  properties: {
    claims: EXTRACT_ATOMS_JSON_SCHEMA.properties.claims,
    evidence: EXTRACT_ATOMS_JSON_SCHEMA.properties.evidence,
    positions: EXTRACT_ATOMS_JSON_SCHEMA.properties.positions,
    events: EXTRACT_ATOMS_JSON_SCHEMA.properties.events,
    standardization_report: {
      type: "object",
      properties: {
        kept: { type: "array", items: STANDARDIZATION_REPORT_ENTRY_SCHEMA },
        merged: { type: "array", items: STANDARDIZATION_REPORT_ENTRY_SCHEMA },
        reclassified: { type: "array", items: STANDARDIZATION_REPORT_ENTRY_SCHEMA },
        discarded: { type: "array", items: STANDARDIZATION_REPORT_ENTRY_SCHEMA },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["kept", "merged", "reclassified", "discarded", "notes"],
      additionalProperties: false,
    },
  },
  required: ["claims", "evidence", "positions", "events", "standardization_report"],
  additionalProperties: false,
} as const;

export function hasSemanticLinks(extraction: ExtractionJson): boolean {
  for (const key of LINK_ARRAY_KEYS) {
    const arr = extraction[key];
    if (Array.isArray(arr) && arr.length > 0) return true;
  }
  return false;
}

export function isAtomsOnly(extraction: ExtractionJson): boolean {
  return !hasSemanticLinks(extraction);
}

export function normalizeEvidenceType(raw: unknown): ExtractedEvidence["evidence_type"] {
  const t = String(raw ?? "other").toLowerCase();
  if (t === "document_ref" || t === "dataset_ref") return "document_reference";
  if (
    t === "quote" ||
    t === "statistic" ||
    t === "reported_fact" ||
    t === "document_reference" ||
    t === "context" ||
    t === "other"
  ) {
    return t;
  }
  return "other";
}

export function normalizePolarity(raw: unknown): ExtractedClaim["polarity"] {
  const p = String(raw ?? "asserts").toLowerCase();
  if (p === "uncertain") return "questions";
  if (p === "asserts" || p === "denies" || p === "questions" || p === "suggests") return p;
  return "asserts";
}

export function holderToSpeakerType(holder: unknown): string | null {
  const h = holder === null || holder === undefined ? null : String(holder);
  if (h === "article" || h === "author") return "narrator";
  if (h === "quoted_actor") return "quoted";
  return null;
}

export function legacySpeakerToHolder(speaker: unknown): ExtractedPosition["holder"] {
  const s = String(speaker ?? "").toLowerCase();
  if (s === "narrator") return "article";
  if (s === "quoted") return "quoted_actor";
  if (s === "critics" || s === "supporters") return "quoted_actor";
  return "article";
}

export function attachProvenance<T extends Record<string, unknown>>(
  items: T[],
  storyId: string,
  chunkIndex: number
): Array<T & ProvenanceFields> {
  return items.map((item) => ({
    ...item,
    source_story_id: storyId,
    source_chunk_index: chunkIndex,
    source_excerpt: String(item.source_excerpt ?? item.excerpt_text ?? item.excerpt ?? "").trim(),
    span_start: typeof item.span_start === "number" ? item.span_start : null,
    span_end: typeof item.span_end === "number" ? item.span_end : null,
    extraction_confidence:
      typeof item.extraction_confidence === "number" ? item.extraction_confidence : 0.5,
  })) as Array<T & ProvenanceFields>;
}

export function normalizeAtomRow(
  entityType: "claim" | "evidence" | "position" | "event",
  row: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...row };
  if (entityType === "claim") {
    out.polarity = normalizePolarity(out.polarity);
  }
  if (entityType === "evidence") {
    out.evidence_type = normalizeEvidenceType(out.evidence_type);
  }
  if (entityType === "position") {
    if (!out.position_type && out.speaker_type) {
      out.position_type = out.speaker_type === "narrator" ? "article_stance" : "actor_stance";
      out.holder = legacySpeakerToHolder(out.speaker_type);
    }
    if (!out.holder && out.speaker_type) {
      out.holder = legacySpeakerToHolder(out.speaker_type);
    }
    if (!out.source_excerpt && out.excerpt_text) {
      out.source_excerpt = out.excerpt_text;
    }
  }
  return out;
}

export function provenanceMetadata(row: Record<string, unknown>): Record<string, unknown> {
  return {
    source_story_id: row.source_story_id ?? null,
    source_chunk_index: row.source_chunk_index ?? null,
    source_excerpt: row.source_excerpt ?? null,
    span_start: row.span_start ?? null,
    span_end: row.span_end ?? null,
  };
}

export function normalizeChunkBlob(blob: Record<string, unknown>): Record<string, unknown> {
  const claims = (Array.isArray(blob.claims) ? blob.claims : []).map((c) =>
    normalizeAtomRow("claim", c as Record<string, unknown>)
  );
  const evidence = (Array.isArray(blob.evidence) ? blob.evidence : []).map((e) =>
    normalizeAtomRow("evidence", e as Record<string, unknown>)
  );
  const positions = (Array.isArray(blob.positions) ? blob.positions : []).map((p) =>
    normalizeAtomRow("position", p as Record<string, unknown>)
  );
  const events = (Array.isArray(blob.events) ? blob.events : []).map((e) =>
    normalizeAtomRow("event", e as Record<string, unknown>)
  );
  return {
    ...blob,
    claims,
    evidence,
    positions,
    events,
    claim_evidence_links: blob.claim_evidence_links ?? blob.links ?? [],
    position_claim_links: blob.position_claim_links ?? [],
    position_evidence_links: blob.position_evidence_links ?? [],
    event_claim_links: blob.event_claim_links ?? [],
    event_evidence_links: blob.event_evidence_links ?? [],
  };
}
