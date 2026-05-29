export type ExtractionQaStatus =
  | "pending"
  | "reviewed"
  | "needs_refinement"
  | "refined"
  | "passed"
  | "needs_human_review";

export type IssueType =
  | "missing_claim"
  | "unsupported_claim"
  | "hallucinated_date"
  | "bad_event_granularity"
  | "missing_position"
  | "weak_evidence_link"
  | "duplicate_extraction"
  | "merge_drift"
  | "bad_link";

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

export type ReviewFinding = {
  type: IssueType | string;
  severity: "blocking" | "warning";
  description: string;
  entity_type?: string;
  entity_index?: number | null;
};

export type ReviewReport = {
  findings: ReviewFinding[];
  recommended_action: "refine" | "validate" | "human_review";
  deterministic_issues?: string[];
};

export type ValidationScores = {
  grounding: number;
  completeness: number;
  granularity: number;
  link_quality: number;
  temporal_accuracy: number;
  merge_fidelity?: number;
};

export type ValidationReport = {
  passes: boolean;
  scores: ValidationScores;
  blocking_issues: string[];
  recommended_status: "passed" | "needs_refinement" | "needs_human_review";
  deterministic_issues?: string[];
};

export type RefinementPatchOp =
  | { op: "add"; entity_type: string; value: Record<string, unknown> }
  | { op: "remove"; entity_type: string; entity_index: number }
  | { op: "update"; entity_type: string; entity_index: number; value: Record<string, unknown> };

export type RefinementPatchResult = {
  patches: RefinementPatchOp[];
};

export const ISSUE_TYPES: IssueType[] = [
  "missing_claim",
  "unsupported_claim",
  "hallucinated_date",
  "bad_event_granularity",
  "missing_position",
  "weak_evidence_link",
  "duplicate_extraction",
  "merge_drift",
  "bad_link",
];

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

export function isEmptyExtraction(extraction: ExtractionJson): boolean {
  const claims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const evidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const events = Array.isArray(extraction.events) ? extraction.events : [];
  return claims.length === 0 && evidence.length === 0 && positions.length === 0 && events.length === 0;
}
