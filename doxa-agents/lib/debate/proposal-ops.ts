import type { AnswerPolarity } from "./question-identity.ts";

export const PROPOSAL_SCHEMA_VERSION = "1.0.0-l3-proposal";
export const EVICT_CAP_FRACTION = 0.3;
export const MERGE_MIN_COSINE = 0.5;
export const HYSTERESIS_CONFIDENCE_DELTA = 0.1;
/** Cold-start auto-apply: EVICT only until measured precision exists for other types. */
export const AUTO_APPLY_START_TYPES = ["EVICT"] as const;
export const PRECISION_MIN = 0.9;
export const PRECISION_MIN_SAMPLES = 10;

export type OpPrecisionRow = {
  op_type: string;
  status: string;
  gold_negative?: boolean | null;
};

export function precisionAllowlist(rows: OpPrecisionRow[]): string[] {
  const byType = new Map<string, { good: number; total: number }>();
  for (const r of rows) {
    const judged = r.status === "applied" || r.gold_negative;
    if (!judged) continue;
    const cur = byType.get(r.op_type) ?? { good: 0, total: 0 };
    cur.total += 1;
    if (r.status === "applied" && !r.gold_negative) cur.good += 1;
    byType.set(r.op_type, cur);
  }
  const allow: string[] = [];
  for (const t of AUTO_APPLY_START_TYPES) {
    const s = byType.get(t);
    if (!s || s.total < PRECISION_MIN_SAMPLES) {
      allow.push(t);
      continue;
    }
    if (s.good / s.total >= PRECISION_MIN) allow.push(t);
  }
  return allow;
}

export const MEMBERSHIP_APPLY_ALL = [
  "ADMIT",
  "EVICT",
  "SPLIT_QUESTION",
  "MERGE_QUESTION",
  "RETITLE_QUESTION",
  "MINT_QUESTION",
  "RETYPE_QUESTION",
  "MARK_INCOMPATIBLE",
  "MARK_ORTHOGONAL",
];

export type MembershipOpType =
  | "ADMIT"
  | "EVICT"
  | "SPLIT_QUESTION"
  | "MERGE_QUESTION"
  | "RETITLE_QUESTION"
  | "MINT_QUESTION"
  | "RETYPE_QUESTION"
  | "MARK_INCOMPATIBLE"
  | "MARK_ORTHOGONAL";

export type ProposalKind =
  | "membership"
  | "viewpoint"
  | "audit"
  | "mint"
  | "consolidate"
  | "source_lead"
  | "lead_candidate";

export const HUMAN_GATED_PROPOSAL_KINDS = new Set<string>([
  "mint",
  "source_lead",
  "lead_candidate",
]);

export function initialProposalStatus(
  kind: string,
  ops?: Array<{ type: string }>
): "pending_approval" | "submitted" {
  // "Reviewed, nothing to change" is a legitimate verdict and has nothing to
  // approve — apply_l3_proposals closes it out as no_op.
  if (ops && ops.length === 0) return "submitted";
  if (HUMAN_GATED_PROPOSAL_KINDS.has(kind)) return "pending_approval";
  if (ops?.some((o) => o.type === "MINT_QUESTION")) return "pending_approval";
  return "submitted";
}

export type MembershipOp = {
  type: MembershipOpType;
  prop_uid?: string;
  polarity?: AnswerPolarity | string;
  target_question_uid?: string;
  new_question_text?: string;
  question_type?: string;
  exclusivity?: string;
  confidence: number;
  rationale: string;
  cited_utterance_uids: string[];
};

export type ViewpointClusterProposal = {
  key_point: string;
  summary: string;
  label?: string;
  member_prop_uids: string[];
  confidence: number;
  cited_utterance_uids: string[];
};

export type MembershipProposalPayload = {
  question_uid: string;
  overall_rationale: string;
  ops: MembershipOp[];
};

export type ViewpointProposalPayload = {
  question_uid: string;
  polarity: string;
  shared_bullets?: string[];
  clash_bullets?: string[];
  clusters: ViewpointClusterProposal[];
};

export type AuditVerdictPayload = {
  controversy_uid: string;
  question_uid?: string;
  verdict: "pass" | "block";
  weakest_member_uid: string;
  reason: string;
  cited_utterance_uids: string[];
};

export type SourceLeadPayload = {
  question_uid: string;
  url: string;
  title?: string;
  note?: string;
  cited_utterance_uids?: string[];
};

export function parseOpType(raw: unknown): MembershipOpType | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  const allowed: MembershipOpType[] = [
    "ADMIT",
    "EVICT",
    "SPLIT_QUESTION",
    "MERGE_QUESTION",
    "RETITLE_QUESTION",
    "MINT_QUESTION",
    "RETYPE_QUESTION",
    "MARK_INCOMPATIBLE",
    "MARK_ORTHOGONAL",
  ];
  return allowed.includes(v as MembershipOpType) ? (v as MembershipOpType) : null;
}

export function normalizeOp(raw: Record<string, unknown>): MembershipOp | null {
  const type = parseOpType(raw.type);
  if (!type) return null;
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0;
  const cited = Array.isArray(raw.cited_utterance_uids)
    ? raw.cited_utterance_uids.map((x) => String(x)).filter(Boolean)
    : [];
  return {
    type,
    prop_uid: raw.prop_uid ? String(raw.prop_uid) : undefined,
    polarity: raw.polarity ? String(raw.polarity) : undefined,
    target_question_uid: raw.target_question_uid
      ? String(raw.target_question_uid)
      : undefined,
    new_question_text: raw.new_question_text ? String(raw.new_question_text) : undefined,
    question_type: raw.question_type ? String(raw.question_type) : undefined,
    exclusivity: raw.exclusivity ? String(raw.exclusivity) : undefined,
    confidence,
    rationale: String(raw.rationale ?? "").slice(0, 800),
    cited_utterance_uids: cited,
  };
}
