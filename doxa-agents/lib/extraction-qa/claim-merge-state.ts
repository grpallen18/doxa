import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ClaimsReviewReport, ClaimAuditEntry, ClaimsReviewPatch } from "./types.ts";
import {
  chunkClaimsReviewPasses,
  MAX_REFINEMENT_ATTEMPTS,
  normalizeClaimAuditVerdict,
} from "./types.ts";

export type ParkedBy = "review" | "approval";

export type ParkedClaim = {
  claim_id: string;
  claim: Record<string, unknown>;
  source_version_id: string;
  parked_by: ParkedBy;
  artifact_id: string;
  parked_at: string;
};

export type RepairQueueEntry = {
  claim_id: string;
  reasons: string[];
  attempt_count: number;
};

/** Drop sink — claims removed from the merge set (review drop, approve drop, or cycle exhaustion). */
export type RejectedFinalClaim = {
  claim_id: string;
  reason: string;
  artifact_id: string;
};

export type ClaimsMergeEligibility = {
  parked: ParkedClaim[];
  repair_queue: RepairQueueEntry[];
  /** Dropped claims (legacy key name). */
  rejected_final: RejectedFinalClaim[];
  pending_approval_claim_ids?: string[];
  last_repair_version_id?: string | null;
};

export type ApprovalVerdict = {
  claim_id: string;
  approved: boolean;
  reason?: string;
  /** true = reject/requeue to refine; false = drop */
  fixable?: boolean;
};

export const EMPTY_CLAIMS_MERGE_ELIGIBILITY: ClaimsMergeEligibility = {
  parked: [],
  repair_queue: [],
  rejected_final: [],
  pending_approval_claim_ids: [],
  last_repair_version_id: null,
};

export function parseClaimsMergeEligibility(value: unknown): ClaimsMergeEligibility {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_CLAIMS_MERGE_ELIGIBILITY, parked: [], repair_queue: [], rejected_final: [] };
  }
  const row = value as Record<string, unknown>;
  return {
    parked: Array.isArray(row.parked) ? (row.parked as ParkedClaim[]) : [],
    repair_queue: Array.isArray(row.repair_queue) ? (row.repair_queue as RepairQueueEntry[]) : [],
    rejected_final: Array.isArray(row.rejected_final) ? (row.rejected_final as RejectedFinalClaim[]) : [],
    pending_approval_claim_ids: Array.isArray(row.pending_approval_claim_ids)
      ? (row.pending_approval_claim_ids as string[])
      : [],
    last_repair_version_id:
      typeof row.last_repair_version_id === "string" ? row.last_repair_version_id : null,
  };
}

export function claimsById(claims: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const claim of claims) {
    const id = typeof claim.claim_id === "string" ? claim.claim_id : null;
    if (id) map.set(id, claim);
  }
  return map;
}

function droppedClaimIds(state: ClaimsMergeEligibility): Set<string> {
  return new Set(state.rejected_final.map((entry) => entry.claim_id));
}

/**
 * Strip out-of-contract review noise: missing_claim issues and add patches.
 * Promote remove patches into drop audit verdicts.
 */
export function sanitizeClaimsReviewReportForPartition(
  report: ClaimsReviewReport,
  claims: Array<Record<string, unknown>>
): ClaimsReviewReport {
  const claimIdAtIndex = (index: number | null): string | null => {
    if (index == null || index < 0 || index >= claims.length) return null;
    const id = claims[index]?.claim_id;
    return typeof id === "string" ? id : null;
  };

  const issues = (report.issues ?? []).filter((issue) => issue.issue_type !== "missing_claim");
  const patches = (report.patches ?? []).filter((patch) => (patch.action as string) !== "add") as ClaimsReviewPatch[];

  const auditById = new Map(
    (report.claim_audit ?? []).map((entry) => [
      entry.claim_id,
      {
        ...entry,
        verdict: normalizeClaimAuditVerdict(entry.verdict),
      },
    ])
  );

  for (const patch of patches) {
    if (patch.action !== "remove") continue;
    const ids = [
      ...(patch.claim_ids ?? []),
      ...(patch.claim_indexes ?? []).map(claimIdAtIndex).filter((id): id is string => id != null),
    ];
    for (const claimId of ids) {
      const existing = auditById.get(claimId);
      auditById.set(claimId, {
        claim_id: claimId,
        verdict: "drop",
        reason: patch.reason || existing?.reason || "dropped_by_review",
      });
    }
  }

  return {
    ...report,
    issues,
    patches,
    claim_audit: [...auditById.values()],
  };
}

export function claimIdsNeedingRepairFromReport(
  claims: Array<Record<string, unknown>>,
  report: ClaimsReviewReport
): { repairIds: Set<string>; dropIds: Set<string> } {
  const repairIds = new Set<string>();
  const dropIds = new Set<string>();

  const claimIdAtIndex = (index: number | null): string | null => {
    if (index == null || index < 0 || index >= claims.length) return null;
    const id = claims[index]?.claim_id;
    return typeof id === "string" ? id : null;
  };

  for (const issue of report.issues ?? []) {
    if (issue.issue_type === "missing_claim") continue;
    const claimId = issue.claim_id ?? claimIdAtIndex(issue.claim_index);
    if (!claimId) continue;
    if (issue.severity === "blocking" && issue.issue_type === "schema_issue") {
      dropIds.add(claimId);
    } else if (issue.severity === "blocking" || issue.severity === "major") {
      repairIds.add(claimId);
    }
  }

  for (const patch of report.patches ?? []) {
    if ((patch.action as string) === "add") continue;
    const target = patch.action === "remove" ? dropIds : repairIds;
    for (const id of patch.claim_ids ?? []) {
      if (id) target.add(id);
    }
    for (const index of patch.claim_indexes ?? []) {
      const id = claimIdAtIndex(index);
      if (id) target.add(id);
    }
  }

  for (const id of dropIds) repairIds.delete(id);

  return { repairIds, dropIds };
}

export function ensureClaimAudit(
  claims: Array<Record<string, unknown>>,
  report: ClaimsReviewReport
): ClaimAuditEntry[] {
  const claimIds = claims
    .map((claim) => (typeof claim.claim_id === "string" ? claim.claim_id : null))
    .filter((id): id is string => id != null);

  const { repairIds, dropIds } = claimIdsNeedingRepairFromReport(claims, report);

  if (report.claim_audit?.length) {
    const auditById = new Map(report.claim_audit.map((entry) => [entry.claim_id, entry]));
    return claimIds.map((claim_id) => {
      const existing = auditById.get(claim_id) ?? {
        claim_id,
        verdict: "needs_repair" as const,
        reason: "missing_audit_entry",
      };
      const verdict = normalizeClaimAuditVerdict(existing.verdict);

      if (dropIds.has(claim_id) || verdict === "drop") {
        return { ...existing, verdict: "drop" as const };
      }
      if (repairIds.has(claim_id) && verdict === "pass") {
        return { ...existing, verdict: "needs_repair" as const };
      }
      return { ...existing, verdict };
    });
  }

  if (chunkClaimsReviewPasses(report)) {
    return claimIds.map((claim_id) => ({ claim_id, verdict: "pass" as const }));
  }

  return claimIds.map((claim_id) => ({
    claim_id,
    verdict: dropIds.has(claim_id)
      ? ("drop" as const)
      : repairIds.has(claim_id)
        ? ("needs_repair" as const)
        : ("pass" as const),
  }));
}

export function seedRepairQueueFromAudit(
  state: ClaimsMergeEligibility,
  audit: ClaimAuditEntry[]
): ClaimsMergeEligibility {
  const parkedIds = new Set(state.parked.map((entry) => entry.claim_id));
  const droppedIds = droppedClaimIds(state);
  const queuedIds = new Set(state.repair_queue.map((entry) => entry.claim_id));
  const additions: RepairQueueEntry[] = [];

  for (const row of audit) {
    if (normalizeClaimAuditVerdict(row.verdict) !== "needs_repair") continue;
    if (parkedIds.has(row.claim_id) || droppedIds.has(row.claim_id) || queuedIds.has(row.claim_id)) {
      continue;
    }
    additions.push({
      claim_id: row.claim_id,
      reasons: row.reason ? [row.reason] : [],
      attempt_count: 0,
    });
    queuedIds.add(row.claim_id);
  }

  if (additions.length === 0) return state;
  return {
    ...state,
    repair_queue: [...state.repair_queue, ...additions],
  };
}

export function parkClaims(
  state: ClaimsMergeEligibility,
  claims: Array<Record<string, unknown>>,
  meta: {
    source_version_id: string;
    parked_by: ParkedBy;
    artifact_id: string;
    parked_at?: string;
  }
): ClaimsMergeEligibility {
  const parkedAt = meta.parked_at ?? new Date().toISOString();
  const dropped = droppedClaimIds(state);
  const existing = new Set(state.parked.map((p) => p.claim_id));
  const nextParked = [...state.parked];

  for (const claim of claims) {
    const claimId = typeof claim.claim_id === "string" ? claim.claim_id : null;
    if (!claimId || existing.has(claimId) || dropped.has(claimId)) continue;
    nextParked.push({
      claim_id: claimId,
      claim,
      source_version_id: meta.source_version_id,
      parked_by: meta.parked_by,
      artifact_id: meta.artifact_id,
      parked_at: parkedAt,
    });
    existing.add(claimId);
  }

  const parkedIds = new Set(nextParked.map((p) => p.claim_id));
  return {
    ...state,
    parked: nextParked,
    repair_queue: state.repair_queue.filter((entry) => !parkedIds.has(entry.claim_id)),
    pending_approval_claim_ids: (state.pending_approval_claim_ids ?? []).filter(
      (id) => !parkedIds.has(id)
    ),
  };
}

export function partitionAfterReview(
  state: ClaimsMergeEligibility,
  claims: Array<Record<string, unknown>>,
  report: ClaimsReviewReport,
  meta: {
    source_version_id: string;
    artifact_id: string;
  }
): ClaimsMergeEligibility {
  const sanitized = sanitizeClaimsReviewReportForPartition(report, claims);
  const byId = claimsById(claims);
  const audit = ensureClaimAudit(claims, sanitized);
  let next = { ...state, repair_queue: [...state.repair_queue], rejected_final: [...state.rejected_final] };

  const toPark: Array<Record<string, unknown>> = [];
  const repairIds = new Set<string>();
  const existingDropped = droppedClaimIds(next);

  for (const row of audit) {
    const claim = byId.get(row.claim_id);
    if (!claim) continue;
    const verdict = normalizeClaimAuditVerdict(row.verdict);

    if (verdict === "pass") {
      toPark.push(claim);
    } else if (verdict === "needs_repair") {
      repairIds.add(row.claim_id);
      const existing = next.repair_queue.find((e) => e.claim_id === row.claim_id);
      if (existing) {
        if (row.reason) existing.reasons.push(row.reason);
      } else {
        next.repair_queue.push({
          claim_id: row.claim_id,
          reasons: row.reason ? [row.reason] : [],
          attempt_count: 0,
        });
      }
    } else if (verdict === "drop") {
      if (!existingDropped.has(row.claim_id)) {
        next.rejected_final.push({
          claim_id: row.claim_id,
          reason: row.reason ?? "dropped_by_review",
          artifact_id: meta.artifact_id,
        });
        existingDropped.add(row.claim_id);
      }
    }
  }

  if (toPark.length > 0) {
    next = parkClaims(next, toPark, {
      source_version_id: meta.source_version_id,
      parked_by: "review",
      artifact_id: meta.artifact_id,
    });
  }

  next.repair_queue = next.repair_queue.filter(
    (entry) =>
      repairIds.has(entry.claim_id) &&
      !next.parked.some((p) => p.claim_id === entry.claim_id) &&
      !next.rejected_final.some((r) => r.claim_id === entry.claim_id)
  );

  return next;
}

export function parkAllClaims(
  state: ClaimsMergeEligibility,
  claims: Array<Record<string, unknown>>,
  meta: {
    source_version_id: string;
    artifact_id: string;
  }
): ClaimsMergeEligibility {
  return parkClaims(state, claims, {
    ...meta,
    parked_by: "review",
  });
}

export function buildRepairPayload(
  state: ClaimsMergeEligibility,
  claims: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const dropped = droppedClaimIds(state);
  const queueIds = new Set(
    state.repair_queue.map((e) => e.claim_id).filter((id) => !dropped.has(id))
  );
  return claims.filter((claim) => {
    const id = typeof claim.claim_id === "string" ? claim.claim_id : null;
    return id != null && queueIds.has(id);
  });
}

export function buildApprovalPayload(
  state: ClaimsMergeEligibility,
  claims: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const dropped = droppedClaimIds(state);
  const pending = new Set(
    (state.pending_approval_claim_ids ?? []).filter((id) => !dropped.has(id))
  );
  if (pending.size === 0) {
    return claims.filter((claim) => {
      const id = typeof claim.claim_id === "string" ? claim.claim_id : null;
      return id != null && !dropped.has(id);
    });
  }
  return claims.filter((claim) => {
    const id = typeof claim.claim_id === "string" ? claim.claim_id : null;
    return id != null && pending.has(id);
  });
}

export function assembleMergeClaims(state: ClaimsMergeEligibility): { claims: Array<Record<string, unknown>> } {
  return {
    claims: state.parked.map((p) => p.claim),
  };
}

export function isChunkMergeReady(
  state: ClaimsMergeEligibility,
  options?: { allowEmpty?: boolean }
): boolean {
  if (state.repair_queue.length > 0) return false;
  if ((state.pending_approval_claim_ids ?? []).length > 0) return false;
  if (state.parked.length > 0) return true;
  return Boolean(options?.allowEmpty);
}

export function repairQueueClaimIds(state: ClaimsMergeEligibility): string[] {
  const dropped = droppedClaimIds(state);
  return state.repair_queue.map((e) => e.claim_id).filter((id) => !dropped.has(id));
}

/**
 * End the claims QA cycle: drop remaining repair/pending claims; keep parked.
 */
export function finalizeClaimsCycleByDroppingRemainder(
  state: ClaimsMergeEligibility,
  meta: {
    artifact_id: string;
    reason?: string;
  }
): ClaimsMergeEligibility {
  const reason = meta.reason ?? "cycle_exhausted";
  const existingDropped = droppedClaimIds(state);
  const nextDropped = [...state.rejected_final];

  for (const entry of state.repair_queue) {
    if (existingDropped.has(entry.claim_id)) continue;
    nextDropped.push({
      claim_id: entry.claim_id,
      reason,
      artifact_id: meta.artifact_id,
    });
    existingDropped.add(entry.claim_id);
  }

  for (const claimId of state.pending_approval_claim_ids ?? []) {
    if (existingDropped.has(claimId)) continue;
    if (state.parked.some((p) => p.claim_id === claimId)) continue;
    nextDropped.push({
      claim_id: claimId,
      reason,
      artifact_id: meta.artifact_id,
    });
    existingDropped.add(claimId);
  }

  return {
    ...state,
    repair_queue: [],
    pending_approval_claim_ids: [],
    rejected_final: nextDropped,
  };
}

export function applyApprovalVerdicts(
  state: ClaimsMergeEligibility,
  claims: Array<Record<string, unknown>>,
  verdicts: ApprovalVerdict[],
  meta: {
    source_version_id: string;
    artifact_id: string;
  }
): ClaimsMergeEligibility {
  const dropped = droppedClaimIds(state);
  const verdictById = new Map(verdicts.map((v) => [v.claim_id, v]));
  let next = {
    ...state,
    repair_queue: [...state.repair_queue],
    rejected_final: [...state.rejected_final],
    pending_approval_claim_ids: [] as string[],
  };

  const toPark: Array<Record<string, unknown>> = [];
  const stillPending: string[] = [];

  for (const claim of claims) {
    const claimId = typeof claim.claim_id === "string" ? claim.claim_id : null;
    if (!claimId || dropped.has(claimId)) continue;

    const verdict = verdictById.get(claimId);
    if (!verdict) {
      stillPending.push(claimId);
      continue;
    }

    if (verdict.approved) {
      toPark.push(claim);
      continue;
    }

    const fixable = verdict.fixable !== false;
    if (fixable) {
      const existing = next.repair_queue.find((e) => e.claim_id === verdict.claim_id);
      const nextAttempt = (existing?.attempt_count ?? 0) + 1;
      if (nextAttempt >= MAX_REFINEMENT_ATTEMPTS) {
        next.rejected_final.push({
          claim_id: verdict.claim_id,
          reason: verdict.reason ?? "max_repair_attempts",
          artifact_id: meta.artifact_id,
        });
        next.repair_queue = next.repair_queue.filter((e) => e.claim_id !== verdict.claim_id);
      } else if (existing) {
        existing.attempt_count = nextAttempt;
        if (verdict.reason) existing.reasons.push(verdict.reason);
      } else {
        next.repair_queue.push({
          claim_id: verdict.claim_id,
          reasons: verdict.reason ? [verdict.reason] : [],
          attempt_count: nextAttempt,
        });
      }
    } else {
      next.rejected_final.push({
        claim_id: verdict.claim_id,
        reason: verdict.reason ?? "dropped_by_approval",
        artifact_id: meta.artifact_id,
      });
      next.repair_queue = next.repair_queue.filter((e) => e.claim_id !== verdict.claim_id);
    }
  }

  next.pending_approval_claim_ids = [
    ...stillPending,
    ...(state.pending_approval_claim_ids ?? []).filter(
      (id) => !claims.some((claim) => claim.claim_id === id) && !dropped.has(id)
    ),
  ];

  if (toPark.length > 0) {
    next = parkClaims(next, toPark, {
      source_version_id: meta.source_version_id,
      parked_by: "approval",
      artifact_id: meta.artifact_id,
    });
  }

  return next;
}

export function setPendingApprovalClaims(
  state: ClaimsMergeEligibility,
  claimIds: string[],
  repairVersionId: string | null
): ClaimsMergeEligibility {
  const dropped = droppedClaimIds(state);
  return {
    ...state,
    pending_approval_claim_ids: claimIds.filter((id) => !dropped.has(id)),
    last_repair_version_id: repairVersionId,
  };
}

export async function loadClaimsMergeEligibility(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<ClaimsMergeEligibility> {
  const { data, error } = await supabase
    .from("story_chunks")
    .select("claims_merge_eligibility")
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex)
    .single();

  if (error) throw new Error(error.message);
  return parseClaimsMergeEligibility(data?.claims_merge_eligibility);
}

export async function saveClaimsMergeEligibility(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number,
  state: ClaimsMergeEligibility
): Promise<void> {
  const { error } = await supabase
    .from("story_chunks")
    .update({ claims_merge_eligibility: state })
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex);

  if (error) throw new Error(error.message);
}
