/**
 * Phase 3 L4 Analytical taxonomy — EvidenceCheck / Assessment kinds.
 */

export type EvidenceVerdict =
  | "supported"
  | "weak"
  | "unsupported"
  | "not_applicable";

export const VALID_EVIDENCE_VERDICTS: EvidenceVerdict[] = [
  "supported",
  "weak",
  "unsupported",
  "not_applicable",
];

export type AssessmentKind = "framing" | "strength" | "coherence" | "other";

export const VALID_ASSESSMENT_KINDS: AssessmentKind[] = [
  "framing",
  "strength",
  "coherence",
  "other",
];

/** Auto-accept band for evidence checks and assessments. */
export const ANALYSIS_AUTO_ACCEPT_MIN_CONFIDENCE = 0.75;

export function parseEvidenceVerdict(raw: unknown): EvidenceVerdict | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase() as EvidenceVerdict;
  return VALID_EVIDENCE_VERDICTS.includes(v) ? v : null;
}

export function parseAssessmentKind(raw: unknown): AssessmentKind | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase() as AssessmentKind;
  return VALID_ASSESSMENT_KINDS.includes(k) ? k : null;
}
