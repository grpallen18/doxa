import type { ExtractedPosition } from "./atom-schema.ts";
import { applySpanToRow, findBestGroundingExcerpt } from "./span-compute.ts";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function clampConfidence(value: unknown, fallback: number): number {
  const x = Number(value);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function mapPositionType(
  signalType: string,
  isSourcePosition: boolean,
  isAttributed: boolean
): ExtractedPosition["position_type"] {
  if (signalType === "implicit" || signalType === "opposed") return "implied_stance";
  if (isAttributed && !isSourcePosition) return "actor_stance";
  return "article_stance";
}

function mapHolder(
  isSourcePosition: boolean,
  isAttributed: boolean
): ExtractedPosition["holder"] {
  if (isAttributed && !isSourcePosition) return "quoted_actor";
  if (isSourcePosition) return "article";
  return "author";
}

function primarySourceExcerpt(raw: Record<string, unknown>, sourceText: string, rawText: string): string {
  const spans = Array.isArray(raw.supporting_spans) ? raw.supporting_spans : [];
  for (const span of spans) {
    const text = String(asRecord(span)?.span_text ?? "").trim();
    if (text) return text;
  }
  const provenance = asRecord(raw.provenance);
  const provSpans = Array.isArray(provenance?.supporting_spans) ? provenance.supporting_spans : [];
  for (const span of provSpans) {
    const text = String(asRecord(span)?.span_text ?? "").trim();
    if (text) return text;
  }
  const direct = String(raw.source_excerpt ?? "").trim();
  if (direct) return direct;
  return findBestGroundingExcerpt(sourceText, rawText);
}

export function normalizeExtractedPositionRow(
  raw: Record<string, unknown>,
  storyId: string,
  chunkIndex: number,
  sourceText: string
): Record<string, unknown> {
  const rawText = String(
    raw.standardized_position_text ?? raw.raw_position_text ?? raw.raw_text ?? ""
  ).trim();

  const ownership = asRecord(raw.source_ownership);
  const isAttributed =
    raw.is_attributed_to_other_actor !== undefined
      ? Boolean(raw.is_attributed_to_other_actor)
      : Boolean(ownership?.is_attributed_to_other_actor);
  const isSourcePosition =
    raw.is_source_position !== undefined
      ? Boolean(raw.is_source_position)
      : ownership?.is_source_position !== undefined
        ? Boolean(ownership.is_source_position)
        : !isAttributed;
  const attributedActor = raw.attributed_actor ?? ownership?.attributed_actor ?? null;
  const sourceEndorses =
    raw.source_endorses_attributed_position ??
    ownership?.source_endorses_attributed_position ??
    (isAttributed && !isSourcePosition ? "unclear" : "not_applicable");
  const signalType = String(raw.signal_type ?? "explicit").toLowerCase();
  const holder =
    typeof raw.holder === "string" && raw.holder.trim()
      ? raw.holder
      : mapHolder(isSourcePosition, isAttributed);

  const sourceExcerpt = primarySourceExcerpt(raw, sourceText, rawText);
  const confidence = clampConfidence(raw.confidence ?? raw.extraction_confidence, sourceExcerpt ? 0.75 : 0.45);

  const row: Record<string, unknown> = {
    raw_text: rawText,
    position_type: mapPositionType(signalType, isSourcePosition, isAttributed),
    holder,
    source_story_id: storyId,
    source_chunk_index: chunkIndex,
    source_excerpt: sourceExcerpt,
    span_start: null,
    span_end: null,
    extraction_confidence: confidence,
    signal_type: signalType,
    signal_strength: clampConfidence(raw.signal_strength, confidence),
    stance_signature: raw.stance_signature ?? null,
    source_ownership: {
      is_source_position: isSourcePosition,
      is_attributed_to_other_actor: isAttributed,
      attributed_actor: attributedActor,
      source_endorses_attributed_position: sourceEndorses,
    },
    provenance: raw.provenance ?? {
      supporting_spans: raw.supporting_spans ?? [],
      inference_rationale: raw.inference_rationale ?? "",
    },
    related_claim_ids: Array.isArray(raw.related_claim_ids) ? raw.related_claim_ids : [],
    notes: String(raw.notes ?? ""),
  };

  if (typeof raw.position_id === "string") row.position_id = raw.position_id;

  return applySpanToRow(row, sourceText);
}

export function normalizeExtractedPositions(
  rows: unknown[],
  storyId: string,
  chunkIndex: number,
  sourceText: string
): Array<Record<string, unknown>> {
  return rows
    .map((item) => (item !== null && typeof item === "object" ? normalizeExtractedPositionRow(item as Record<string, unknown>, storyId, chunkIndex, sourceText) : null))
    .filter((row): row is Record<string, unknown> => row != null && String(row.raw_text ?? "").trim().length > 0);
}
