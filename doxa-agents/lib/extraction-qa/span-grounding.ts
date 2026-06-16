import type { ClaimsReviewIssue, ExtractionJson } from "./types.ts";
import { findBestGroundingExcerpt, wordOverlapScore } from "./span-compute.ts";
import { extractStrictTemporalTokens, fuzzyContains } from "./text-match.ts";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function sourceExcerpt(row: unknown): string {
  const o = asRecord(row);
  if (!o) return "";
  return String(o.source_excerpt ?? o.excerpt_text ?? o.excerpt ?? "").trim();
}

function normalizeExcerptKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectNumericPhraseTokens(text: string): string[] {
  const tokens = new Set<string>();
  const patterns = [
    /\b\d+\s+days?\b/gi,
    /\b\d+\s+months?\b/gi,
    /\b\d+\s+years?\b/gi,
    /\b\d+(?:\.\d+)?%/g,
    /\$\d[\d,.]*\b/g,
  ];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      tokens.add(match[0].trim());
    }
  }
  return [...tokens];
}

export function detectSpanGroundingMismatch(
  sourceText: string,
  rawText: string,
  storedExcerpt: string
): string | null {
  const claim = rawText.trim();
  const excerpt = storedExcerpt.trim();
  if (!claim || !excerpt || !sourceText) return null;

  const bestExcerpt = findBestGroundingExcerpt(sourceText, claim);
  if (!bestExcerpt) return null;

  const excerptOverlap = wordOverlapScore(excerpt, claim);
  const bestOverlap = wordOverlapScore(bestExcerpt, claim);
  const sameExcerpt = normalizeExcerptKey(bestExcerpt) === normalizeExcerptKey(excerpt);

  const numericInClaim = collectNumericPhraseTokens(claim);
  const numericMissingFromExcerpt = numericInClaim.filter(
    (token) => fuzzyContains(sourceText, token) && !fuzzyContains(excerpt, token)
  );
  if (numericMissingFromExcerpt.length > 0) {
    return (
      `stored source_excerpt does not contain claim quantities (${numericMissingFromExcerpt.join(", ")}); ` +
      "claim may be supported elsewhere in the chunk"
    );
  }

  const temporalInClaim = extractStrictTemporalTokens(claim);
  const temporalMissingFromExcerpt = temporalInClaim.filter(
    (token) => fuzzyContains(sourceText, token) && !fuzzyContains(excerpt, token)
  );
  if (temporalMissingFromExcerpt.length > 0) {
    return (
      `stored source_excerpt does not contain claim timeframe (${temporalMissingFromExcerpt.join(", ")}); ` +
      "claim may be supported elsewhere in the chunk"
    );
  }

  if (
    !sameExcerpt &&
    bestOverlap >= 0.3 &&
    excerptOverlap < bestOverlap - 0.1 &&
    bestOverlap - excerptOverlap >= 0.12
  ) {
    return "stored source_excerpt does not support claim text; better grounding exists in the chunk";
  }

  return null;
}

export function collectSpanGroundingMismatchIssues(
  sourceText: string,
  extraction: ExtractionJson
): ClaimsReviewIssue[] {
  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const issues: ClaimsReviewIssue[] = [];

  for (let i = 0; i < claims.length; i++) {
    const row = claims[i];
    const claimId = asRecord(row)?.claim_id;
    const rawText = String(asRecord(row)?.raw_text ?? "").trim();
    const excerpt = sourceExcerpt(row);
    if (!rawText || !excerpt) continue;

    const finding = detectSpanGroundingMismatch(sourceText, rawText, excerpt);
    if (!finding) continue;

    issues.push({
      severity: "blocking",
      claim_id: typeof claimId === "string" ? claimId : null,
      claim_index: i,
      issue_type: "span_grounding_mismatch",
      finding,
    });
  }

  return issues;
}

export function spanGroundingDeterministicStrings(issues: ClaimsReviewIssue[]): string[] {
  return issues.map((issue) => {
    const idx = issue.claim_index != null ? issue.claim_index + 1 : "?";
    const id = issue.claim_id ? ` (${issue.claim_id})` : "";
    return `span_grounding_mismatch: claim ${idx}${id}: ${issue.finding}`;
  });
}

export function mergeSpanGroundingIntoClaimsReview<
  T extends {
    issues?: ClaimsReviewIssue[];
    deterministic_issues?: string[];
    passes_review?: boolean;
    recommended_action?: string;
  },
>(report: T, spanIssues: ClaimsReviewIssue[]): T {
  if (spanIssues.length === 0) return report;

  const driftStrings = spanGroundingDeterministicStrings(spanIssues);
  const existingIssues = Array.isArray(report.issues) ? report.issues : [];
  const existingDeterministic = Array.isArray(report.deterministic_issues)
    ? report.deterministic_issues
    : [];

  const spanKeys = new Set(
    spanIssues.map(
      (issue) =>
        `${issue.claim_id ?? ""}:${issue.claim_index ?? ""}:span_grounding_mismatch`
    )
  );
  const filteredExisting = existingIssues.filter((issue) => {
    if (issue.issue_type !== "span_grounding_mismatch") return true;
    const key = `${issue.claim_id ?? ""}:${issue.claim_index ?? ""}:span_grounding_mismatch`;
    return !spanKeys.has(key);
  });
  const filteredDeterministic = existingDeterministic.filter(
    (entry) => !entry.startsWith("span_grounding_mismatch:")
  );

  const merged: T = {
    ...report,
    issues: [...spanIssues, ...filteredExisting],
    deterministic_issues: [...filteredDeterministic, ...driftStrings],
  };

  if (spanIssues.length > 0) {
    merged.passes_review = false;
    if (merged.recommended_action === "validate" || merged.recommended_action == null) {
      merged.recommended_action = "needs_refinement";
    }
  }

  return merged;
}
