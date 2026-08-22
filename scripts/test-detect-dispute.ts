/**
 * Unit checks for definitional dispute qualification.
 * Usage: npx tsx scripts/test-detect-dispute.ts
 */

import {
  disputeUidFromPair,
  evaluateDefinitionalDispute,
} from '../doxa-agents/lib/debate/detect-dispute.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(
  !evaluateDefinitionalDispute({
    questionUid: 'cq:1',
    questionType: 'policy',
    assignments: [
      { propUid: 'p1', polarity: 'FAVOR', confidence: 0.85, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'AGAINST', confidence: 0.8, debateRole: 'thesis' },
    ],
  }).qualifies,
  'policy Question → no definitional dispute'
)

assert(
  evaluateDefinitionalDispute({
    questionUid: 'cq:2',
    questionType: 'definitional',
    assignments: [
      { propUid: 'p1', polarity: 'NONE', confidence: 0.9, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'NONE', confidence: 0.88, debateRole: 'thesis' },
    ],
  }).qualifies,
  'definitional + 2 theses → dispute'
)

assert(
  !evaluateDefinitionalDispute({
    questionUid: 'cq:3',
    questionType: 'definitional',
    assignments: [
      { propUid: 'p1', polarity: 'NONE', confidence: 0.9, debateRole: 'thesis' },
    ],
  }).qualifies,
  'definitional single thesis → no dispute'
)

const uid = disputeUidFromPair('definitional_conflict', 'prop:b', 'prop:a')
assert(uid.includes('prop:a') && uid.includes('prop:b'), 'dispute uid sorts prop pair')

console.log('test-detect-dispute: all checks passed')
