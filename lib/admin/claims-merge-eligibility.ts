/** Admin-side parser for story_chunks.claims_merge_eligibility (mirrors pipeline claim-merge-state). */

export type AdminClaimsMergeEligibility = {
  parked: unknown[]
  repair_queue: Array<{ claim_id: string }>
  rejected_final: unknown[]
  pending_approval_claim_ids: string[]
}

export type ClaimMergeBucket =
  | 'parked'
  | 'repair_queue'
  | 'pending_approval'
  | 'dropped'
  | null

export const EMPTY_ADMIN_CLAIMS_MERGE_ELIGIBILITY: AdminClaimsMergeEligibility = {
  parked: [],
  repair_queue: [],
  rejected_final: [],
  pending_approval_claim_ids: [],
}

function claimIdFromEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const id = (entry as { claim_id?: unknown }).claim_id
  return typeof id === 'string' && id.length > 0 ? id : null
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

export function mergeEligibilityHasSignal(state: AdminClaimsMergeEligibility): boolean {
  return (
    state.parked.length > 0 ||
    state.repair_queue.length > 0 ||
    state.pending_approval_claim_ids.length > 0 ||
    state.rejected_final.length > 0
  )
}

/** Prefer parked > pending_approval > repair_queue > dropped when ids overlap. */
export function claimMergeBucket(
  state: AdminClaimsMergeEligibility,
  claimId: string
): ClaimMergeBucket {
  for (const entry of state.parked) {
    if (claimIdFromEntry(entry) === claimId) return 'parked'
  }
  if (state.pending_approval_claim_ids.includes(claimId)) return 'pending_approval'
  if (state.repair_queue.some((entry) => entry.claim_id === claimId)) return 'repair_queue'
  for (const entry of state.rejected_final) {
    if (claimIdFromEntry(entry) === claimId) return 'dropped'
  }
  return null
}

export function parkedByForClaim(
  state: AdminClaimsMergeEligibility,
  claimId: string
): 'review' | 'approval' | null {
  for (const entry of state.parked) {
    if (claimIdFromEntry(entry) !== claimId) continue
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const by = (entry as { parked_by?: unknown }).parked_by
    if (by === 'review' || by === 'approval') return by
    return null
  }
  return null
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
