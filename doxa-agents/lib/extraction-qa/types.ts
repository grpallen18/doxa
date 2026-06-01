export type ExtractionQaStatus =
  | "pending"
  | "reviewed"
  | "standardized"
  | "needs_refinement"
  | "refined"
  | "atoms_passed"
  | "passed"
  | "needs_human_review";

export const MAX_VALIDATION_ATTEMPTS = 3;
export const MAX_REFINEMENT_ATTEMPTS = 3;

export type StandardizationReportEntry = {
  entity_type?: string | null;
  entity_index?: number | null;
  description?: string;
  reason?: string;
};

export type StandardizationReport = {
  kept: StandardizationReportEntry[];
  merged: StandardizationReportEntry[];
  reclassified: StandardizationReportEntry[];
  discarded: StandardizationReportEntry[];
  notes: string[];
};

export type ValidationBlockingIssue = {
  issue_type: string;
  entity_type: string | null;
  entity_index: number | null;
  description: string;
  acceptance_criteria: string;
};

export function normalizeBlockingIssues(
  issues: Array<string | ValidationBlockingIssue> | undefined
): ValidationBlockingIssue[] {
  return (issues ?? []).map((issue) => {
    if (typeof issue === "string") {
      return {
        issue_type: "other",
        entity_type: null,
        entity_index: null,
        description: issue,
        acceptance_criteria: issue,
      };
    }
    return issue;
  });
}


export function resolveValidationFailureStatus(
  attemptCount: number,
  recommendedStatus: "passed" | "needs_refinement" | "needs_human_review" | "promote" | "reject" | "atoms_passed"
): ExtractionQaStatus {
  if (attemptCount >= MAX_VALIDATION_ATTEMPTS) return "needs_human_review";
  if (recommendedStatus === "needs_refinement") return "needs_refinement";
  return "needs_human_review";
}

export type IssueType =
  | "missing_claim"
  | "unsupported_claim"
  | "hallucinated_date"
  | "bad_event_granularity"
  | "missing_position"
  | "missing_evidence"
  | "missing_event"
  | "weak_evidence_link"
  | "duplicate_extraction"
  | "merge_drift"
  | "bad_link"
  | "missing_link"
  | "bad_granularity"
  | "overmerged_claim"
  | "confidence_issue"
  | "schema_issue"
  | "provenance_missing"
  | "provenance_not_verbatim"
  | "span_mismatch"
  | "unsupported_location"
  | "bad_claim_style";

export type ExtractionJson = {
  claims?: unknown[];
  evidence?: unknown[];
  claim_evidence_links?: unknown[];
  positions?: unknown[];
  position_claim_links?: unknown[];
  position_evidence_links?: unknown[];
  events?: unknown[];
  event_claim_links?: unknown[];
  event_evidence_links?: unknown[];
};

export type RecommendedPatch = {
  op: "add" | "remove" | "update" | "link" | "unlink" | "none";
  entity_type?: string | null;
  entity_index?: number | null;
  replacement_text?: string | null;
  new_entity?: Record<string, unknown> | null;
  link?: Record<string, unknown> | null;
};

export type ReviewFinding = {
  type: IssueType | string;
  severity: "blocking" | "major" | "minor" | "warning";
  description: string;
  entity_type?: string | null;
  entity_index?: number | null;
  link_type?: string | null;
  unsupported_text?: string | null;
  source_excerpt?: string | null;
  recommended_patch?: RecommendedPatch | null;
};

export type QualityScores = {
  grounding: number;
  completeness: number;
  temporal_accuracy: number;
  granularity: number;
  provenance_quality: number;
  position_capture: number;
  link_quality?: number;
};

export type ReviewReport = {
  findings: ReviewFinding[];
  recommended_action: "refine" | "validate" | "human_review" | "accept";
  deterministic_issues?: string[];
  completeness_issues?: string[];
  passes_review?: boolean;
  summary?: string;
  quality_scores?: QualityScores;
};

export type DeterministicChecksDetail = {
  all_evidence_excerpts_verbatim: boolean;
  all_provenance_excerpts_verbatim: boolean;
  all_link_indexes_valid: boolean;
  unsupported_dates_detected: string[];
  unsupported_locations_detected: string[];
  span_mismatches: string[];
  orphan_evidence_indexes: number[];
  orphan_claim_indexes: number[];
  orphan_position_indexes: number[];
  orphan_event_indexes: number[];
};

export type StrictPreValidationResult = {
  passes: boolean;
  blocking_issues: string[];
  issues: string[];
  deterministic_checks: DeterministicChecksDetail;
};

export type ValidationScores = {
  grounding: number;
  completeness: number;
  granularity: number;
  provenance_quality: number;
  temporal_accuracy: number;
  position_capture?: number;
  schema_validity?: number;
  taxonomy_quality?: number;
  materiality?: number;
  merge_fidelity?: number;
  link_quality?: number;
};

export type ValidationReport = {
  passes: boolean;
  scores: ValidationScores;
  blocking_issues: Array<string | ValidationBlockingIssue>;
  recommended_status: "passed" | "needs_refinement" | "needs_human_review" | "promote" | "reject" | "atoms_passed";
  recommended_next_agent?: "refiner" | "human_review";
  attempt_number?: number;
  deterministic_issues?: string[];
  summary?: string;
  major_issues?: string[];
  minor_warnings?: string[];
  materiality_warnings?: string[];
  deterministic_checks?: DeterministicChecksDetail;
  promotion_gate?: {
    eligible_for_promotion: boolean;
    reason: string;
  };
};

export type RefinementPatchOp =
  | { op: "add"; entity_type: string; entity_index?: number | null; value: Record<string, unknown> }
  | { op: "remove"; entity_type: string; entity_index: number; value?: Record<string, unknown> | null }
  | { op: "update"; entity_type: string; entity_index: number; value: Record<string, unknown> }
  | { op: "link"; entity_type: string; entity_index?: number | null; value: Record<string, unknown> }
  | { op: "unlink"; entity_type: string; entity_index: number; value?: Record<string, unknown> | null };

export type RefinementPatchResult = {
  patches: RefinementPatchOp[];
  ignored_findings?: string[];
};

export const ISSUE_TYPES: IssueType[] = [
  "missing_claim",
  "unsupported_claim",
  "hallucinated_date",
  "bad_event_granularity",
  "missing_position",
  "missing_evidence",
  "missing_event",
  "weak_evidence_link",
  "duplicate_extraction",
  "merge_drift",
  "bad_link",
  "missing_link",
  "bad_granularity",
  "overmerged_claim",
  "confidence_issue",
  "schema_issue",
  "provenance_missing",
  "provenance_not_verbatim",
  "span_mismatch",
  "unsupported_location",
  "bad_claim_style",
];

export const LINK_ARRAY_KEYS = [
  "claim_evidence_links",
  "position_claim_links",
  "position_evidence_links",
  "event_claim_links",
  "event_evidence_links",
] as const;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

export function asExtractionJson(raw: unknown): ExtractionJson {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractionJson;
}

export function isClaimsOnlyExtraction(extraction: ExtractionJson): boolean {
  const claims = Array.isArray(extraction.claims) ? extraction.claims.length : 0;
  const evidence = Array.isArray(extraction.evidence) ? extraction.evidence.length : 0;
  const positions = Array.isArray(extraction.positions) ? extraction.positions.length : 0;
  const events = Array.isArray(extraction.events) ? extraction.events.length : 0;
  return claims > 0 && evidence === 0 && positions === 0 && events === 0;
}

export function isEmptyExtraction(extraction: ExtractionJson): boolean {
  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const evidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const events = Array.isArray(extraction.events) ? extraction.events : [];
  return claims.length === 0 && evidence.length === 0 && positions.length === 0 && events.length === 0;
}

export function isBlockingSeverity(severity: string | undefined): boolean {
  return severity === "blocking";
}

export function isFixableSeverity(severity: string | undefined): boolean {
  return severity === "blocking" || severity === "major";
}
