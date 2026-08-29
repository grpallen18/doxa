/**
 * Unit checks for L3 proposal validator (no Neo).
 * Usage: npx tsx scripts/test-l3-proposal-validator.ts
 */

import { validateAuditVerdict, validateViewpointProposal } from '../doxa-agents/lib/debate/proposal-validator.ts'
import { normalizeOp, precisionAllowlist } from '../doxa-agents/lib/debate/proposal-ops.ts'
import { shouldBindCandidate } from '../doxa-agents/lib/debate/nli-rerank.ts'
import { blockingKeyFrom, predicateLemmaFromQuestion } from '../doxa-agents/lib/debate/question-identity.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(normalizeOp({ type: 'ADMIT', confidence: 0.9, cited_utterance_uids: ['u1'] })?.type === 'ADMIT', 'parse ADMIT')
assert(normalizeOp({ type: 'NOPE' }) === null, 'reject unknown op')

const vp = validateViewpointProposal({
  question_uid: 'cq:x',
  polarity: 'FAVOR',
  clusters: [
    {
      key_point: 'deterrence',
      summary: 'aid deters',
      member_prop_uids: ['p1'],
      confidence: 0.8,
      cited_utterance_uids: ['u1'],
    },
  ],
})
assert(vp.ok, 'viewpoint ok')

const audit = validateAuditVerdict({
  controversy_uid: 'ctr_x',
  verdict: 'pass',
  weakest_member_uid: 'p2',
  reason: 'least on-topic',
  cited_utterance_uids: ['u1'],
})
assert(audit.ok, 'audit ok')
assert(
  !validateAuditVerdict({
    controversy_uid: 'ctr_x',
    verdict: 'pass',
    weakest_member_uid: '',
    reason: 'x',
    cited_utterance_uids: ['u1'],
  }).ok,
  'audit requires weakest member'
)

assert(
  shouldBindCandidate({ cosine: 0.5, sharedEntity: false, nli: 'entail', minCosine: 0.32 }),
  'nli entail binds'
)
assert(
  !shouldBindCandidate({ cosine: 0.2, sharedEntity: false, nli: 'neutral', minCosine: 0.32 }),
  'weak cosine dropped'
)

const key = blockingKeyFrom({
  questionType: 'policy',
  predicateLemma: predicateLemmaFromQuestion('Should the US continue military aid to Ukraine?'),
})
assert(key.startsWith('policy|'), `blocking key ${key}`)

const cold = precisionAllowlist([])
assert(cold.includes('EVICT') && !cold.includes('ADMIT'), 'cold start auto-applies EVICT only')
const hotFail = precisionAllowlist(
  Array.from({ length: 10 }, () => ({ op_type: 'EVICT', status: 'applied', gold_negative: true }))
)
assert(!hotFail.includes('EVICT'), 'EVICT drops when gold-negative precision is poor')

console.log('test-l3-proposal-validator: ok')
