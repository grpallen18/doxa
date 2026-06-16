import { ensureStableClaimIds } from "./claim-ids.ts";
import { attachClaimsFromRawText, applySpanToRow, sourceExcerptFromAtom } from "./span-compute.ts";
import { normalizeText, verbatimContains } from "./text-match.ts";

const VALID_POLARITIES = new Set(["asserts", "denies", "uncertain"]);
const VALID_STANCES = new Set(["support", "oppose", "neutral"]);

export type NormalizeClaimsDropped = {
  claim_id?: string;
  raw_text?: string;
  reason: string;
};

export type NormalizeClaimsResult = {
  claims: Array<Record<string, unknown>>;
  dropped: NormalizeClaimsDropped[];
  warnings: string[];
};

function asClaimRow(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coercePolarity(value: unknown): string {
  const s = String(value ?? "asserts").toLowerCase();
  return VALID_POLARITIES.has(s) ? s : "asserts";
}

function coerceStance(value: unknown): string {
  const s = String(value ?? "neutral").toLowerCase();
  return VALID_STANCES.has(s) ? s : "neutral";
}

function coerceConfidence(value: unknown, hasExcerpt: boolean): number {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  return hasExcerpt ? 0.75 : 0.45;
}

function dedupeByNormalizedText(
  claims: Array<Record<string, unknown>>
): { kept: Array<Record<string, unknown>>; dropped: NormalizeClaimsDropped[] } {
  const seen = new Map<string, Record<string, unknown>>();
  const dropped: NormalizeClaimsDropped[] = [];

  for (const claim of claims) {
    const key = normalizeText(String(claim.raw_text ?? ""));
    if (!key) continue;
    if (seen.has(key)) {
      dropped.push({
        claim_id: typeof claim.claim_id === "string" ? claim.claim_id : undefined,
        raw_text: String(claim.raw_text ?? ""),
        reason: "duplicate_normalized_text",
      });
      continue;
    }
    seen.set(key, claim);
  }

  return { kept: [...seen.values()], dropped };
}

function attachClaimProvenance(
  row: {
    raw_text: string;
    claim_id?: string;
    polarity?: unknown;
    stance?: unknown;
    extraction_confidence?: unknown;
    source_excerpt?: unknown;
  },
  storyId: string,
  chunkIndex: number,
  sourceText: string
): Record<string, unknown> {
  const verbatimExcerpt = String(row.source_excerpt ?? "").trim();
  if (verbatimExcerpt && verbatimContains(sourceText, verbatimExcerpt)) {
    const base: Record<string, unknown> = {
      raw_text: row.raw_text,
      polarity: coercePolarity(row.polarity),
      stance: coerceStance(row.stance),
      source_story_id: storyId,
      source_chunk_index: chunkIndex,
      source_excerpt: verbatimExcerpt,
      span_start: null,
      span_end: null,
      extraction_confidence: coerceConfidence(row.extraction_confidence, true),
    };
    if (row.claim_id) base.claim_id = row.claim_id;
    return applySpanToRow(base, sourceText);
  }

  const [attached] = attachClaimsFromRawText(
    [{ raw_text: row.raw_text, ...(row.claim_id ? { claim_id: row.claim_id } : {}) }],
    storyId,
    chunkIndex,
    sourceText
  );
  return attached;
}

export async function normalizeChunkClaims(
  rawClaims: unknown[],
  storyId: string,
  chunkIndex: number,
  sourceText: string,
  options?: { refinementCycle?: number; preserveClaimIds?: boolean }
): Promise<NormalizeClaimsResult> {
  const warnings: string[] = [];
  const dropped: NormalizeClaimsDropped[] = [];

  const parsed = (Array.isArray(rawClaims) ? rawClaims : [])
    .map(asClaimRow)
    .filter((row): row is Record<string, unknown> => row != null)
    .map((row) => ({
      raw_text: String(row.raw_text ?? row.claim_text ?? "").trim(),
      claim_id: options?.preserveClaimIds && typeof row.claim_id === "string" ? row.claim_id : undefined,
      polarity: row.polarity,
      stance: row.stance,
      extraction_confidence: row.extraction_confidence,
      source_excerpt: row.source_excerpt,
    }))
    .filter((row) => row.raw_text.length > 0);

  const attached = parsed.map((row) => attachClaimProvenance(row, storyId, chunkIndex, sourceText));

  const withFields = attached.map((row, index) => {
    const src = parsed[index];
    const excerpt = sourceExcerptFromAtom(row);
    return {
      ...row,
      polarity: coercePolarity(src?.polarity ?? row.polarity),
      stance: coerceStance(src?.stance ?? row.stance),
      source_story_id: storyId,
      source_chunk_index: chunkIndex,
      extraction_confidence: coerceConfidence(src?.extraction_confidence ?? row.extraction_confidence, Boolean(excerpt)),
    };
  });

  const grounded: Array<Record<string, unknown>> = [];
  for (const row of withFields) {
    const excerpt = sourceExcerptFromAtom(row);
    if (!excerpt || !verbatimContains(sourceText, excerpt)) {
      dropped.push({
        claim_id: typeof row.claim_id === "string" ? row.claim_id : undefined,
        raw_text: String(row.raw_text ?? ""),
        reason: "ungrounded_excerpt",
      });
      continue;
    }
    grounded.push(row);
  }

  const { kept, dropped: dedupeDropped } = dedupeByNormalizedText(grounded);
  dropped.push(...dedupeDropped);

  const withIds = await ensureStableClaimIds(kept, storyId, chunkIndex, {
    refinementCycle: options?.refinementCycle,
  });

  if (dropped.length > 0) {
    warnings.push(`dropped_${dropped.length}_claims_during_normalize`);
  }

  return { claims: withIds, dropped, warnings };
}

export function validateNormalizedClaimsForChunk(
  claims: Array<Record<string, unknown>>,
  storyId: string,
  chunkIndex: number,
  sourceText: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = [
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
  ] as const;

  for (let i = 0; i < claims.length; i++) {
    const row = claims[i];
    for (const field of required) {
      if (row[field] === undefined || row[field] === null || row[field] === "") {
        errors.push(`claim ${i + 1} missing ${field}`);
      }
    }
    if (String(row.source_story_id) !== storyId) {
      errors.push(`claim ${i + 1} source_story_id mismatch`);
    }
    if (Number(row.source_chunk_index) !== chunkIndex) {
      errors.push(`claim ${i + 1} source_chunk_index mismatch`);
    }
    const excerpt = String(row.source_excerpt ?? "");
    if (excerpt && !verbatimContains(sourceText, excerpt)) {
      errors.push(`claim ${i + 1} source_excerpt not in chunk text`);
    }
  }

  return { valid: errors.length === 0, errors };
}
