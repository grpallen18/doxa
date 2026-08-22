/**
 * Unit checks for controversy qualification rules.
 * Usage: npx tsx scripts/test-qualify-controversy.ts
 */

import {
  controversyUidFromQuestion,
  evaluateQuestionControversy,
} from '../doxa-agents/lib/debate/qualify-controversy.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const q = 'cq:abc123'

assert(
  !evaluateQuestionControversy({
    questionUid: q,
    questionType: 'policy',
    answerExclusivity: 'exclusive',
    assignments: [
      { propUid: 'p1', polarity: 'FAVOR', confidence: 0.85, debateRole: 'thesis' },
    ],
  }).qualifies,
  'measles FAVOR-only → no controversy'
)

assert(
  evaluateQuestionControversy({
    questionUid: q,
    questionType: 'policy',
    answerExclusivity: 'exclusive',
    assignments: [
      { propUid: 'p1', polarity: 'FAVOR', confidence: 0.85, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'AGAINST', confidence: 0.8, debateRole: 'thesis' },
    ],
  }).qualifies,
  'FAVOR+AGAINST policy → controversy'
)

assert(
  !evaluateQuestionControversy({
    questionUid: q,
    questionType: 'causal',
    answerExclusivity: 'compatible',
    assignments: [
      { propUid: 'p1', polarity: 'AFFIRMS', confidence: 0.9, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'AFFIRMS', confidence: 0.88, debateRole: 'thesis' },
    ],
  }).qualifies,
  'compatible causal multi-AFFIRMS → no controversy'
)

assert(
  evaluateQuestionControversy({
    questionUid: q,
    questionType: 'factual',
    answerExclusivity: 'exclusive',
    assignments: [
      { propUid: 'p1', polarity: 'AFFIRMS', confidence: 0.75, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'DENIES', confidence: 0.72, debateRole: 'thesis' },
    ],
  }).qualifies,
  'AFFIRMS+DENIES factual → controversy'
)

assert(
  !evaluateQuestionControversy({
    questionUid: q,
    questionType: 'definitional',
    answerExclusivity: 'exclusive',
    assignments: [
      { propUid: 'p1', polarity: 'FAVOR', confidence: 0.9, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'AGAINST', confidence: 0.9, debateRole: 'thesis' },
    ],
  }).qualifies,
  'definitional → skip'
)

assert(
  !evaluateQuestionControversy({
    questionUid: q,
    questionType: 'policy',
    answerExclusivity: 'exclusive',
    assignments: [
      { propUid: 'p1', polarity: 'FAVOR', confidence: 0.85, debateRole: 'thesis' },
      { propUid: 'p2', polarity: 'AGAINST', confidence: 0.8, debateRole: 'thesis' },
    ],
    vetoLabels: ['talking_past'],
  }).qualifies,
  'veto blocks establishment'
)

assert(
  controversyUidFromQuestion('cq:deadbeef0123456789ab').startsWith('ctr_'),
  'controversy uid prefix'
)

console.log('test-qualify-controversy: ok')
