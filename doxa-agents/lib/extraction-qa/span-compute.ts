import { normalizeText, verbatimContains } from "./text-match.ts";
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

function applySpanToRow(row: Record<string, unknown>, sourceText: string): Record<string, unknown> {
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
