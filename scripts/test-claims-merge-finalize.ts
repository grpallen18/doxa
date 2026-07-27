/**
 * Claims merge finalize / drop audit — run: npx tsx scripts/test-claims-merge-finalize.ts
 */
import {
  finalizeClaimsCycleByDroppingRemainder,
  partitionAfterReview,
  buildRepairPayload,
  isChunkMergeReady,
  EMPTY_CLAIMS_MERGE_ELIGIBILITY,
} from '../doxa-agents/lib/extraction-qa/claim-merge-state.ts'
import {
  resolveClaimsReviewFailureStatus,
  CLAIMS_QA_COMPLETE_STATUS,
} from '../doxa-agents/lib/extraction-qa/types.ts'

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL: ${label}`)
    process.exitCode = 1
    throw new Error(label)
  }
  console.log(`ok: ${label}`)
}

{
  const claims = [
    { claim_id: 'cc_pass', raw_text: 'Pass claim.' },
    { claim_id: 'cc_repair', raw_text: 'Repair claim.' },
    { claim_id: 'cc_drop', raw_text: 'Drop claim.' },
  ]
  const partitioned = partitionAfterReview(
    { ...EMPTY_CLAIMS_MERGE_ELIGIBILITY },
    claims,
    {
      passes_review: false,
      recommended_action: 'needs_refinement',
      summary: 'mixed',
      issues: [],
      patches: [{ action: 'remove', entity_type: 'claim', severity: 'major', claim_ids: ['cc_drop'], claim_indexes: [], recommended_raw_text: null, reason: 'duplicate', source_grounding: 'n/a' }],
      claim_audit: [
        { claim_id: 'cc_pass', verdict: 'pass' },
        { claim_id: 'cc_repair', verdict: 'needs_repair' },
        { claim_id: 'cc_drop', verdict: 'drop' },
      ],
    },
    { source_version_id: 'v0', artifact_id: 'art1' }
  )
  assert('parks pass', partitioned.parked.some((p) => p.claim_id === 'cc_pass'))
  assert('queues repair', partitioned.repair_queue.some((e) => e.claim_id === 'cc_repair'))
  assert('drops remove', partitioned.rejected_final.some((e) => e.claim_id === 'cc_drop'))
  const repairPayload = buildRepairPayload(partitioned, claims)
  assert('repair excludes drop', !repairPayload.some((c) => c.claim_id === 'cc_drop'))
  assert('repair includes revise', repairPayload.some((c) => c.claim_id === 'cc_repair'))
}

{
  const state = {
    ...EMPTY_CLAIMS_MERGE_ELIGIBILITY,
    parked: [
      {
        claim_id: 'cc_parked',
        claim: { claim_id: 'cc_parked' },
        source_version_id: 'v0',
        parked_by: 'review' as const,
        artifact_id: 'a',
        parked_at: new Date().toISOString(),
      },
    ],
    repair_queue: [{ claim_id: 'cc_left', reasons: ['x'], attempt_count: 2 }],
    pending_approval_claim_ids: ['cc_pending'],
  }
  const finalized = finalizeClaimsCycleByDroppingRemainder(state, {
    artifact_id: 'fin',
    reason: 'cycle_exhausted',
  })
  assert('keeps parked', finalized.parked.length === 1)
  assert('clears repair', finalized.repair_queue.length === 0)
  assert('clears pending', (finalized.pending_approval_claim_ids ?? []).length === 0)
  assert(
    'drops remainder',
    finalized.rejected_final.some((e) => e.claim_id === 'cc_left') &&
      finalized.rejected_final.some((e) => e.claim_id === 'cc_pending')
  )
  assert('merge ready', isChunkMergeReady(finalized, { allowEmpty: true }))
}

{
  assert(
    'status complete when no repair',
    resolveClaimsReviewFailureStatus(1, 'validate', {
      issues: [],
      patches: [],
      claim_audit: [{ claim_id: 'a', verdict: 'drop' }],
    }) === CLAIMS_QA_COMPLETE_STATUS
  )
  assert(
    'status needs_refinement when revise',
    resolveClaimsReviewFailureStatus(1, 'needs_refinement', {
      issues: [],
      patches: [],
      claim_audit: [{ claim_id: 'a', verdict: 'needs_repair' }],
    }) === 'needs_refinement'
  )
  assert(
    'validation cap completes even with revise findings',
    resolveClaimsReviewFailureStatus(3, 'needs_refinement', {
      issues: [],
      patches: [],
      claim_audit: [{ claim_id: 'a', verdict: 'needs_repair' }],
    }) === CLAIMS_QA_COMPLETE_STATUS
  )
}

console.log('all claims-merge-finalize tests passed')
