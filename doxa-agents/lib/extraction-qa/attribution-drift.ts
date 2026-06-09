import type { ClaimsReviewIssue, ExtractionJson } from "./types.ts";

const SPEECH_VERBS = [
  "said",
  "claimed",
  "argued",
  "suggested",
  "noted",
  "stated",
  "told",
  "wrote",
  "posted",
  "alleged",
  "warned",
  "defended",
  "called",
  "expressed",
  "announced",
  "declared",
  "added",
  "confirmed",
  "denied",
  "replied",
  "responded",
  "insisted",
  "maintained",
  "acknowledged",
  "reported",
  "reports",
] as const;

const SPEECH_VERB_RE = new RegExp(`\\b(${SPEECH_VERBS.join("|")})\\b`, "i");

const ATTRIBUTION_FINDING =
  "Claim appears to attribute article narration to a speaker. The claim begins with an attribution phrase, but the source excerpt does not contain matching attribution support.";

type ClaimAttribution =
  | { kind: "speaker_verb"; subject: string; verb: string }
  | { kind: "according_to"; phrase: string }
  | { kind: "article_reports" };

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function sourceExcerpt(row: unknown): string {
  const o = asRecord(row);
  if (!o) return "";
  return String(o.source_excerpt ?? o.excerpt_text ?? o.excerpt ?? "").trim();
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "have",
  "has",
  "was",
  "were",
  "are",
  "will",
  "can",
  "may",
  "who",
  "what",
  "when",
  "where",
  "which",
  "their",
  "they",
  "them",
  "his",
  "her",
  "she",
  "him",
  "our",
  "your",
  "its",
  "not",
  "but",
  "also",
  "into",
  "about",
  "after",
  "before",
  "during",
  "said",
  "according",
]);

export function parseClaimAttributionPrefix(rawText: string): ClaimAttribution | null {
  const text = rawText.trim();
  if (!text) return null;

  const accordingTo = /^according to\s+(.+?)(?:,|\s+that\b|\s*[,.]|$)/i.exec(text);
  if (accordingTo) {
    return { kind: "according_to", phrase: accordingTo[1].trim() };
  }

  if (/^the article reports?\b/i.test(text)) {
    return { kind: "article_reports" };
  }

  const speakerVerb = new RegExp(`^(.+?)\\s+(${SPEECH_VERBS.join("|")})\\b`, "i").exec(text);
  if (!speakerVerb) return null;

  const subject = speakerVerb[1].trim();
  if (!subject || subject.length > 100) return null;

  return {
    kind: "speaker_verb",
    subject,
    verb: speakerVerb[2].toLowerCase(),
  };
}

function phraseTokensAppearInExcerpt(phrase: string, excerpt: string): boolean {
  const tokens = significantTokens(phrase);
  if (tokens.length === 0) return false;
  const lower = excerpt.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t));
  return hits.length >= Math.min(2, tokens.length);
}

export function excerptSupportsClaimAttribution(
  excerpt: string,
  attribution: ClaimAttribution
): boolean {
  const ex = excerpt.trim();
  if (!ex) return true;

  switch (attribution.kind) {
    case "article_reports":
      return /\breports?\b/i.test(ex);
    case "according_to":
      if (/\baccording to\b/i.test(ex)) return true;
      return phraseTokensAppearInExcerpt(attribution.phrase, ex);
    case "speaker_verb": {
      if (!SPEECH_VERB_RE.test(ex)) return false;

      const lower = ex.toLowerCase();
      const subjectTokens = significantTokens(attribution.subject);
      if (subjectTokens.some((t) => lower.includes(t))) return true;

      if (/\b(he|she|they)\b/i.test(ex)) return true;

      return true;
    }
  }
}

export function detectAttributionDrift(
  claim: unknown,
  claimIndex: number
): ClaimsReviewIssue | null {
  const row = asRecord(claim);
  if (!row) return null;

  const rawText = String(row.raw_text ?? "").trim();
  const excerpt = sourceExcerpt(claim);
  const attribution = parseClaimAttributionPrefix(rawText);
  if (!attribution) return null;

  if (excerptSupportsClaimAttribution(excerpt, attribution)) return null;

  const claimId = typeof row.claim_id === "string" ? row.claim_id : null;

  return {
    severity: "major",
    issue_type: "attribution",
    claim_id: claimId,
    claim_index: claimIndex,
    finding: ATTRIBUTION_FINDING,
  };
}

export function collectAttributionDriftIssues(extraction: ExtractionJson): ClaimsReviewIssue[] {
  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const issues: ClaimsReviewIssue[] = [];

  for (let i = 0; i < claims.length; i++) {
    const issue = detectAttributionDrift(claims[i], i);
    if (issue) issues.push(issue);
  }

  return issues;
}

export function attributionDriftDeterministicStrings(issues: ClaimsReviewIssue[]): string[] {
  return issues.map((issue) => {
    const idx = issue.claim_index != null ? issue.claim_index + 1 : "?";
    const id = issue.claim_id ? ` (${issue.claim_id})` : "";
    return `attribution_drift: claim ${idx}${id}: ${issue.finding}`;
  });
}

export function mergeAttributionDriftIntoClaimsReview<
  T extends {
    issues?: ClaimsReviewIssue[];
    deterministic_issues?: string[];
    passes_review?: boolean;
    recommended_action?: string;
  },
>(report: T, attributionIssues: ClaimsReviewIssue[]): T {
  if (attributionIssues.length === 0) return report;

  const driftStrings = attributionDriftDeterministicStrings(attributionIssues);
  const existingIssues = Array.isArray(report.issues) ? report.issues : [];
  const existingDeterministic = Array.isArray(report.deterministic_issues)
    ? report.deterministic_issues
    : [];

  const merged: T = {
    ...report,
    issues: [...attributionIssues, ...existingIssues],
    deterministic_issues: [...existingDeterministic, ...driftStrings],
  };

  if (attributionIssues.length > 0) {
    merged.passes_review = false;
    if (merged.recommended_action === "validate" || merged.recommended_action == null) {
      merged.recommended_action = "needs_refinement";
    }
  }

  return merged;
}
