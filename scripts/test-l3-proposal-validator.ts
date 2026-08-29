/**
 * Unit checks for L3 proposal validator (no Neo).
 * Usage: npx tsx scripts/test-l3-proposal-validator.ts
 */

import {
  validateAuditVerdict,
  validateMembershipProposal,
  validateViewpointProposal,
  type QueryFn,
} from '../doxa-agents/lib/debate/proposal-validator.ts'
import {
  initialProposalStatus,
  normalizeOp,
  precisionAllowlist,
} from '../doxa-agents/lib/debate/proposal-ops.ts'
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

/**
 * Fake graph: two propositions, one utterance each, plus one question.
 * Enough to exercise citation reachability and MINT founding rules.
 */
const utterancesByProp: Record<string, string> = {
  'prop:a': 'utt:a',
  'prop:b': 'utt:b',
}
const fakeQuery: QueryFn = async (cypher, params = {}) => {
  const p = params as Record<string, never>
  if (cypher.includes('MATCH (q:Question {uid: $uid})') && cypher.includes('questionType')) {
    return [{ uid: 'cq:x', questionType: 'policy', question: 'Should we do X?' }] as never[]
  }
  if (cypher.includes('count(*) AS n')) return [{ n: 2 }] as never[]
  if (cypher.includes('[:EXPRESSES]->(p:Proposition)') && cypher.includes('count(DISTINCT p)')) {
    const uids = (p.uids ?? []) as unknown as string[]
    const props = new Set(
      uids.map((u) => Object.keys(utterancesByProp).find((k) => utterancesByProp[k] === u))
    )
    props.delete(undefined as never)
    return [{ n: props.size }] as never[]
  }
  if (cypher.includes('EXPRESSES]-(u:Utterance {uid: $utteranceUid})')) {
    const { propUid, utteranceUid } = p as unknown as { propUid: string; utteranceUid: string }
    return utterancesByProp[propUid] === utteranceUid ? ([{ ok: 1 }] as never[]) : []
  }
  if (cypher.includes('MATCH (u:Utterance {uid: $utteranceUid})')) {
    const { utteranceUid } = p as unknown as { utteranceUid: string }
    return Object.values(utterancesByProp).includes(utteranceUid) ? ([{ ok: 1 }] as never[]) : []
  }
  if (cypher.includes('MATCH (d:Decision)')) return []
  return []
}

const mintOp = {
  type: 'MINT_QUESTION' as const,
  new_question_text: 'Should we do X?',
  question_type: 'policy',
  confidence: 0.8,
  rationale: 'contrast pair',
  cited_utterance_uids: ['utt:a', 'utt:b'],
}

assert(initialProposalStatus('mint', []) === 'submitted', 'empty ops never wait on approval')
assert(
  initialProposalStatus('mint', [{ type: 'MINT_QUESTION' }]) === 'pending_approval',
  'MINT still gated on approval'
)

async function membershipChecks() {
  const mintTwoProps = await validateMembershipProposal(fakeQuery, {
    question_uid: 'cq:x',
    overall_rationale: 'mint',
    ops: [mintOp],
  })
  assert(mintTwoProps.ok, `MINT across two propositions validates: ${JSON.stringify(mintTwoProps)}`)

  const mintAnchored = await validateMembershipProposal(fakeQuery, {
    question_uid: 'cq:x',
    overall_rationale: 'mint with anchor',
    ops: [{ ...mintOp, prop_uid: 'prop:a' }],
  })
  assert(mintAnchored.ok, `anchored MINT validates: ${JSON.stringify(mintAnchored)}`)

  const mintBadAnchor = await validateMembershipProposal(fakeQuery, {
    question_uid: 'cq:x',
    overall_rationale: 'mint with unrelated anchor',
    ops: [{ ...mintOp, prop_uid: 'prop:c' }],
  })
  assert(
    mintBadAnchor.ops[0].errors.some((e) => e.includes('anchor')),
    `MINT anchor must be one of the cited propositions: ${JSON.stringify(mintBadAnchor.ops)}`
  )

  const mintSingleton = await validateMembershipProposal(fakeQuery, {
    question_uid: 'cq:x',
    overall_rationale: 'mint from one proposition',
    ops: [{ ...mintOp, cited_utterance_uids: ['utt:a', 'utt:a'] }],
  })
  assert(
    mintSingleton.ops[0].errors.some((e) => e.includes('two distinct propositions')),
    `a singleton proposition cannot found a question: ${JSON.stringify(mintSingleton.ops)}`
  )

  const admitCrossCite = await validateMembershipProposal(fakeQuery, {
    question_uid: 'cq:x',
    overall_rationale: 'admit',
    ops: [
      {
        type: 'ADMIT',
        prop_uid: 'prop:a',
        polarity: 'FAVOR',
        confidence: 0.8,
        rationale: 'x',
        cited_utterance_uids: ['utt:b'],
      },
    ],
  })
  assert(
    admitCrossCite.ops[0].errors.some((e) => e.includes('not reachable')),
    `ADMIT still requires its own utterance: ${JSON.stringify(admitCrossCite.ops)}`
  )
}

membershipChecks()
  .then(() => console.log('test-l3-proposal-validator: ok'))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
