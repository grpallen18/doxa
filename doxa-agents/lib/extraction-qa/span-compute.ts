import { fuzzyContains, normalizeText, verbatimContains } from "./text-match.ts";
import type { ExtractionJson } from "./types.ts";

export type VerbatimSpan = { start: number; end: number };

export function sourceExcerptFromAtom(row: Record<string, unknown>): string {
  return String(row.source_excerpt ?? row.excerpt_text ?? row.excerpt ?? "").trim();
}

export function findVerbatimSpan(
  sourceText: string,
  excerpt: string,
  hintStart?: number | null
): VerbatimSpan | null {
  const trimmed = excerpt.trim();
  if (!trimmed || !sourceText) return null;

  const exactIdx = sourceText.indexOf(trimmed);
  if (exactIdx >= 0) {
    return { start: exactIdx, end: exactIdx + trimmed.length };
  }

  const candidates = findAllNormalizedSpans(sourceText, trimmed);
  if (candidates.length === 0) return null;

  if (hintStart == null || !Number.isFinite(hintStart)) {
    return candidates[0];
  }

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.start - hintStart) < Math.abs(best.start - hintStart) ? candidate : best
  );
}

function findAllNormalizedSpans(sourceText: string, excerpt: string): VerbatimSpan[] {
  const targetNorm = normalizeText(excerpt);
  if (!targetNorm) return [];

  const results: VerbatimSpan[] = [];
  const targetLen = targetNorm.length;

  for (let start = 0; start < sourceText.length; start++) {
    let end = start + 1;
    while (end <= sourceText.length) {
      const sliceNorm = normalizeText(sourceText.slice(start, end));

      if (sliceNorm === targetNorm) {
        results.push({ start, end });
        break;
      }

      if (sliceNorm.length > targetLen || !targetNorm.startsWith(sliceNorm)) {
        break;
      }
      end++;
    }
  }

  return results;
}

export function applySpanToRow(row: Record<string, unknown>, sourceText: string): Record<string, unknown> {
  const excerpt = sourceExcerptFromAtom(row);
  if (!excerpt) return row;

  const hint =
    typeof row.span_start === "number" && Number.isFinite(row.span_start) ? row.span_start : null;
  const span = findVerbatimSpan(sourceText, excerpt, hint);
  if (!span) return row;

  return {
    ...row,
    span_start: span.start,
    span_end: span.end,
  };
}

function filterVerbatimAtoms(list: unknown[] | undefined, sourceText: string): unknown[] {
  return (Array.isArray(list) ? list : []).filter((item) => {
    if (item === null || typeof item !== "object") return false;
    const excerpt = sourceExcerptFromAtom(item as Record<string, unknown>);
    if (!excerpt) return false;
    return verbatimContains(sourceText, excerpt);
  });
}

export function enforceVerbatimExcerpts(extraction: ExtractionJson, sourceText: string): ExtractionJson {
  return {
    ...extraction,
    claims: filterVerbatimAtoms(extraction.claims, sourceText),
    evidence: filterVerbatimAtoms(extraction.evidence, sourceText),
    positions: filterVerbatimAtoms(extraction.positions, sourceText),
    events: filterVerbatimAtoms(extraction.events, sourceText),
  };
}

export function wordOverlapScore(a: string, b: string): number {
  const wordsA = new Set(
    normalizeText(a)
      .split(" ")
      .filter((w) => w.length > 3)
  );
  const wordsB = normalizeText(b)
    .split(" ")
    .filter((w) => w.length > 3);
  if (wordsB.length === 0) return 0;
  const matched = wordsB.filter((w) => wordsA.has(w)).length;
  return matched / wordsB.length;
}

export function findBestGroundingExcerpt(sourceText: string, claimText: string): string {
  const trimmedClaim = claimText.trim();
  if (!trimmedClaim || !sourceText) return "";

  const direct = findVerbatimSpan(sourceText, trimmedClaim);
  if (direct) return sourceText.slice(direct.start, direct.end);

  const sentences = sourceText
    .split(/\n\n+/)
    .flatMap((p) => p.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  let best = "";
  let bestScore = 0;
  for (const sentence of sentences) {
    const score = wordOverlapScore(sentence, trimmedClaim);
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  if (bestScore >= 0.2 && best) return best;

  if (fuzzyContains(sourceText, trimmedClaim)) {
    return sentences[0] ?? sourceText.slice(0, Math.min(240, sourceText.length)).trim();
  }

  return sentences.find((s) => wordOverlapScore(s, trimmedClaim) >= 0.15) ?? "";
}

export function attachClaimsFromRawText(
  claims: Array<{ raw_text: string; claim_id?: string }>,
  storyId: string,
  chunkIndex: number,
  sourceText: string
): Array<Record<string, unknown>> {
  return claims.map((claim) => {
    const rawText = String(claim.raw_text ?? "").trim();
    const sourceExcerpt = findBestGroundingExcerpt(sourceText, rawText);
    const row: Record<string, unknown> = {
      raw_text: rawText,
      polarity: "asserts",
      stance: "neutral",
      source_story_id: storyId,
      source_chunk_index: chunkIndex,
      source_excerpt: sourceExcerpt,
      span_start: null,
      span_end: null,
      extraction_confidence: sourceExcerpt ? 0.75 : 0.45,
    };
    if (claim.claim_id) row.claim_id = claim.claim_id;
    const withSpan = applySpanToRow(row, sourceText);
    return withSpan;
  });
}

export function attachPositionsFromRawText(
  positions: Array<{ raw_text: string; position_id?: string; source_excerpt?: string }>,
  storyId: string,
  chunkIndex: number,
  sourceText: string
): Array<Record<string, unknown>> {
  return positions.map((position) => {
    const rawText = String(position.raw_text ?? "").trim();
    const sourceExcerpt =
      String(position.source_excerpt ?? "").trim() || findBestGroundingExcerpt(sourceText, rawText);
    const row: Record<string, unknown> = {
      raw_text: rawText,
      position_type: "article_stance",
      holder: "article",
      source_story_id: storyId,
      source_chunk_index: chunkIndex,
      source_excerpt: sourceExcerpt,
      span_start: null,
      span_end: null,
      extraction_confidence: sourceExcerpt ? 0.75 : 0.45,
    };
    if (position.position_id) row.position_id = position.position_id;
    return applySpanToRow(row, sourceText);
  });
}

export function applyProvenanceSpans(extraction: ExtractionJson, sourceText: string): ExtractionJson {
  const mapList = (list: unknown[] | undefined) =>
    (Array.isArray(list) ? list : []).map((item) =>
      item !== null && typeof item === "object"
        ? applySpanToRow(item as Record<string, unknown>, sourceText)
        : item
    );

  return {
    ...extraction,
    claims: mapList(extraction.claims),
    evidence: mapList(extraction.evidence),
    positions: mapList(extraction.positions),
    events: mapList(extraction.events),
  };
}
