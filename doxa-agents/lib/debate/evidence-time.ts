/**
 * Safe evidence timestamps for controversy time-chaptering.
 * Document.publishedAt is an ISO string from the graph-worker — never call
 * .epochMillis on it directly.
 */

import { CHAPTER_GAP_DAYS } from "./issue-assignment.ts";
import { STABLE_IDENTITY_JACCARD } from "./stable-identity.ts";

export const CHAPTER_GAP_MS = CHAPTER_GAP_DAYS * 24 * 60 * 60 * 1000;

/**
 * Cypher expression yielding epoch millis for a Document `d` (alias required).
 * ISO strings containing 'T' → datetime(...).epochMillis; else updatedAt; else 0.
 */
export const DOCUMENT_EVIDENCE_MS_CYPHER = `
CASE
  WHEN d.publishedAt IS NOT NULL AND toString(d.publishedAt) CONTAINS 'T'
    THEN datetime(toString(d.publishedAt)).epochMillis
  WHEN d.updatedAt IS NOT NULL
    THEN d.updatedAt.epochMillis
  ELSE 0
END
`.trim();

export function evidenceGapDays(newerMs: number, olderMs: number): number {
  if (!(newerMs > 0) || !(olderMs > 0)) return 0;
  return (newerMs - olderMs) / (1000 * 60 * 60 * 24);
}

/**
 * Fork when predecessor Jaccard is in (0, 0.5) and new evidence is ≥ gap days
 * after the predecessor's newest evidence.
 */
export function shouldForkTimeChapter(input: {
  predecessorUid: string | null | undefined;
  predecessorScore: number | null | undefined;
  newEvidenceMs: number;
  predecessorEvidenceMs: number;
  gapDays?: number;
}): boolean {
  const uid = input.predecessorUid;
  const score = Number(input.predecessorScore) || 0;
  if (!uid || score <= 0 || score >= STABLE_IDENTITY_JACCARD) return false;
  const gap = evidenceGapDays(input.newEvidenceMs, input.predecessorEvidenceMs);
  return gap >= (input.gapDays ?? CHAPTER_GAP_DAYS);
}
