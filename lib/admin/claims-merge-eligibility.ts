/** Admin-side parser for story_chunks.claims_merge_eligibility (mirrors pipeline claim-merge-state). */

export type AdminClaimsMergeEligibility = {
  parked: unknown[]
  repair_queue: Array<{ claim_id: string }>
  rejected_final: unknown[]
  pending_approval_claim_ids: string[]
}

export const EMPTY_ADMIN_CLAIMS_MERGE_ELIGIBILITY: AdminClaimsMergeEligibility = {
  parked: [],
  repair_queue: [],
  rejected_final: [],
  pending_approval_claim_ids: [],
}

export function parseClaimsMergeEligibility(value: unknown): AdminClaimsMergeEligibility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_ADMIN_CLAIMS_MERGE_ELIGIBILITY }
  }
  const row = value as Record<string, unknown>
  return {
    parked: Array.isArray(row.parked) ? row.parked : [],
    repair_queue: Array.isArray(row.repair_queue)
      ? (row.repair_queue as Array<{ claim_id: string }>)
      : [],
    rejected_final: Array.isArray(row.rejected_final) ? row.rejected_final : [],
    pending_approval_claim_ids: Array.isArray(row.pending_approval_claim_ids)
      ? (row.pending_approval_claim_ids as string[])
      : [],
  }
}

export function mergeEligibilitySnapshot(value: unknown): {
  parked_count: number
  repair_queue_ids: string[]
  pending_approval_ids: string[]
  rejected_final_count: number
} {
  const state = parseClaimsMergeEligibility(value)
  return {
    parked_count: state.parked.length,
    repair_queue_ids: state.repair_queue.map((e) => e.claim_id).filter(Boolean),
    pending_approval_ids: state.pending_approval_claim_ids,
    rejected_final_count: state.rejected_final.length,
  }
}
