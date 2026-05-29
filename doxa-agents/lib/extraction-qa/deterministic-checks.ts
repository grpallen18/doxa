import type { ExtractionJson, ValidationReport } from "./types.ts";
import { extractTemporalTokens, fuzzyContains, temporalTokensInSource } from "./text-match.ts";
import { isEmptyExtraction } from "./types.ts";

export type DeterministicCheckResult = {
  issues: string[];
  blocking_count: number;
};

function claimText(c: unknown): string {
  if (c === null || typeof c !== "object") return "";
  return String((c as { raw_text?: unknown }).raw_text ?? "");
}

function eventSummary(e: unknown): string {
  if (e === null || typeof e !== "object") return "";
  return String((e as { event_summary?: unknown }).event_summary ?? "");
}

export function runDeterministicChecks(
  sourceText: string,
  extraction: ExtractionJson
): DeterministicCheckResult {
  const issues: string[] = [];

  if (isEmptyExtraction(extraction)) {
    return { issues: ["empty_extraction"], blocking_count: 0 };
  }

  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const evidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const events = Array.isArray(extraction.events) ? extraction.events : [];
  const claimEvidenceLinks = Array.isArray(extraction.claim_evidence_links)
    ? extraction.claim_evidence_links
    : [];
  const eventEvidenceLinks = Array.isArray(extraction.event_evidence_links)
    ? extraction.event_evidence_links
    : [];

  for (let i = 0; i < claims.length; i++) {
    const text = claimText(claims[i]);
    for (const token of extractTemporalTokens(text)) {
      if (!temporalTokensInSource(token, sourceText)) {
        issues.push(`hallucinated_date: claim ${i + 1} temporal "${token}" not in source`);
      }
    }
  }

  for (let i = 0; i < evidence.length; i++) {
    const ex = evidence[i];
    const excerpt =
      ex !== null && typeof ex === "object"
        ? String((ex as { excerpt?: unknown }).excerpt ?? "")
        : "";
    if (excerpt && !fuzzyContains(sourceText, excerpt)) {
      issues.push(`unsupported_evidence: evidence ${i + 1} excerpt not found in source`);
    }
  }

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p === null || typeof p !== "object") continue;
    const po = p as { excerpt_text?: string; cue_phrases?: string[] };
    const excerpt = po.excerpt_text ?? "";
    const cues = Array.isArray(po.cue_phrases) ? po.cue_phrases : [];
    if (excerpt && !fuzzyContains(sourceText, excerpt)) {
      issues.push(`unsupported_position: position ${i + 1} excerpt not in source`);
    }
    for (const cue of cues) {
      if (cue && excerpt && !fuzzyContains(excerpt, cue)) {
        issues.push(`weak_position_cue: position ${i + 1} cue "${cue}" not in excerpt`);
      }
    }
  }

  for (let i = 0; i < events.length; i++) {
    const summary = eventSummary(events[i]);
    for (const token of extractTemporalTokens(summary)) {
      if (!temporalTokensInSource(token, sourceText)) {
        issues.push(`hallucinated_date: event ${i + 1} temporal "${token}" not in source`);
      }
    }
    if (!eventEvidenceLinks.some((l) => (l as { event_index?: number }).event_index === i)) {
      issues.push(`orphan_event: event ${i + 1} has no event_evidence_links`);
    }
  }

  const linkedEvidence = new Set(
    claimEvidenceLinks.map((l) => (l as { evidence_index?: number }).evidence_index)
  );
  for (let i = 0; i < evidence.length; i++) {
    const hasClaimLink = linkedEvidence.has(i);
    const hasEventLink = eventEvidenceLinks.some(
      (l) => (l as { evidence_index?: number }).evidence_index === i
    );
    if (!hasClaimLink && !hasEventLink) {
      issues.push(`orphan_evidence: evidence ${i + 1} has no links`);
    }
  }

  const blocking = issues.filter(
    (x) =>
      x.startsWith("hallucinated_date") ||
      x.startsWith("unsupported_evidence") ||
      x.startsWith("orphan_")
  ).length;

  return { issues, blocking_count: blocking };
}

export function deterministicToValidationReport(
  check: DeterministicCheckResult,
  includeMergeFidelity = false
): ValidationReport | null {
  if (check.issues.length === 0 || (check.issues.length === 1 && check.issues[0] === "empty_extraction")) {
    return null;
  }
  const blocking = check.issues.filter(
    (x) =>
      x.startsWith("hallucinated_date") ||
      x.startsWith("unsupported_evidence") ||
      x.startsWith("orphan_") ||
      x.startsWith("unsupported_position")
  );
  if (blocking.length === 0) return null;

  const scores = {
    grounding: blocking.some((x) => x.includes("unsupported") || x.includes("orphan")) ? 0.4 : 0.8,
    completeness: 0.7,
    granularity: 0.7,
    link_quality: blocking.some((x) => x.includes("orphan")) ? 0.3 : 0.8,
    temporal_accuracy: blocking.some((x) => x.includes("hallucinated_date")) ? 0.2 : 0.9,
    ...(includeMergeFidelity ? { merge_fidelity: 0.8 } : {}),
  };

  return {
    passes: false,
    scores,
    blocking_issues: blocking,
    recommended_status: "needs_human_review",
    deterministic_issues: check.issues,
  };
}

export function autoPassEmptyExtraction(): ValidationReport {
  return {
    passes: true,
    scores: {
      grounding: 1,
      completeness: 1,
      granularity: 1,
      link_quality: 1,
      temporal_accuracy: 1,
    },
    blocking_issues: [],
    recommended_status: "passed",
    deterministic_issues: ["empty_extraction_auto_pass"],
  };
}
