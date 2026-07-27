import assert from 'node:assert/strict'
import { buildClaimReviewWorkspace } from '../lib/admin/claim-review-workspace'
import type { ChunkQaHistoryPayload } from '../lib/admin/chunk-qa-history'

function claim(id: string, text: string) {
  return {
    claim_id: id,
    raw_text: text,
    polarity: 'asserts',
    stance: 'neutral',
  }
}

function basePayload(overrides: Partial<ChunkQaHistoryPayload> = {}): ChunkQaHistoryPayload {
  return {
    events: [
      {
        id: 'rev-1',
        kind: 'review',
        stage: 'chunk_claims_review',
        created_at: '2026-07-27T04:20:00.000Z',
        reverted: false,
        run_id: null,
        model_name: null,
        prompt_version_id: null,
        prompt_version_number: null,
        prompt_step_id: null,
        claims_before: [],
        claims_after: [
          claim('c_pass', 'Passed claim'),
          claim('c_repair', 'Repair claim'),
        ],
        claim_diffs: [],
        report: {
          claim_audit: [
            { claim_id: 'c_pass', verdict: 'pass', reason: 'ok' },
            { claim_id: 'c_repair', verdict: 'needs_repair', reason: 'span' },
          ],
          issues: [],
          patches: [],
        },
      },
    ],
    claim_version_matrix: [],
    version_labels: [],
    version_timeline: '',
    claim_versions: [
      {
        version_id: 'v0',
        version_number: 0,
        source: 'extractor',
        parent_version_id: null,
        created_from_review_id: null,
        review_outcome: 'needs_refinement',
        status: 'superseded',
        created_at: '2026-07-27T04:19:00.000Z',
        claims_json: {
          claims: [claim('c_pass', 'Passed claim'), claim('c_repair', 'Repair claim')],
        },
      },
      {
        version_id: 'v1',
        version_number: 1,
        source: 'refiner',
        parent_version_id: 'v0',
        created_from_review_id: 'rev-1',
        review_outcome: null,
        status: 'active',
        created_at: '2026-07-27T04:30:00.000Z',
        claims_json: {
          claims: [claim('c_repair', 'Repair claim fixed')],
        },
      },
    ],
    ...overrides,
  }
}

{
  // Without merge eligibility, refined repair claim stays "pending" (legacy heuristic).
  const ws = buildClaimReviewWorkspace(basePayload())
  assert.equal(ws.rowsByTab.approved.length, 1)
  assert.equal(ws.rowsByTab.pending.length, 1)
  assert.equal(ws.rowsByTab.pending[0]?.claimId, 'c_repair')
}

{
  // With merge eligibility after approve: both parked → all approved.
  const ws = buildClaimReviewWorkspace(
    basePayload({
      claims_merge_eligibility: {
        parked: [
          { claim_id: 'c_pass', parked_by: 'review', claim: claim('c_pass', 'Passed claim') },
          {
            claim_id: 'c_repair',
            parked_by: 'approval',
            claim: claim('c_repair', 'Repair claim fixed'),
          },
        ],
        repair_queue: [],
        pending_approval_claim_ids: [],
        rejected_final: [],
      },
    })
  )
  assert.equal(ws.rowsByTab.approved.length, 2)
  assert.equal(ws.rowsByTab.pending.length, 0)
  assert.equal(ws.rowsByTab.needs_refinement.length, 0)
  const repaired = ws.rowsByTab.approved.find((row) => row.claimId === 'c_repair')
  assert.equal(repaired?.lastStep, 'Approved')
}

{
  // Pending approval bucket.
  const ws = buildClaimReviewWorkspace(
    basePayload({
      claims_merge_eligibility: {
        parked: [{ claim_id: 'c_pass', parked_by: 'review', claim: claim('c_pass', 'Passed claim') }],
        repair_queue: [],
        pending_approval_claim_ids: ['c_repair'],
        rejected_final: [],
      },
    })
  )
  assert.equal(ws.rowsByTab.approved.length, 1)
  assert.equal(ws.rowsByTab.pending.length, 1)
  assert.equal(ws.rowsByTab.pending[0]?.lastStep, 'Awaiting approval')
}

{
  // Dropped sink.
  const ws = buildClaimReviewWorkspace(
    basePayload({
      claims_merge_eligibility: {
        parked: [{ claim_id: 'c_pass', parked_by: 'review', claim: claim('c_pass', 'Passed claim') }],
        repair_queue: [],
        pending_approval_claim_ids: [],
        rejected_final: [{ claim_id: 'c_repair', reason: 'dropped_by_approval' }],
      },
    })
  )
  assert.equal(ws.rowsByTab.approved.length, 1)
  assert.equal(ws.rowsByTab.rejected.length, 1)
  assert.equal(ws.rowsByTab.rejected[0]?.statusLabel, 'Dropped')
}

console.log('ok: claim-review-workspace merge eligibility statuses')
