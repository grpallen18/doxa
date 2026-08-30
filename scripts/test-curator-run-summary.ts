/**
 * Unit checks for curator run summary formatting.
 * Usage: npx tsx scripts/test-curator-run-summary.ts
 */

import {
  classifyProposalOutcome,
  formatCuratorRunSummaryText,
  formatRationaleForSummary,
  summarizeMembershipOps,
} from '../lib/l3/curator-run-summary-format.ts'
import type { CuratorRunSummary } from '../lib/l3/curator-run-summary-format.ts'

const numbered =
  '1) Both founding props are Dudley\'s: talk-less guidance "has gone too far," and the Fed should raise the funds rate "deliberately" rather than hold. 2) Weakest is the rate-call prop. 3) Both sides are not present — no counter-thesis in cluster.'
const formatted = formatRationaleForSummary(numbered)
if (!formatted.includes('• Both founding')) throw new Error('expected bullet for point 1')
if (!formatted.includes('• Weakest')) throw new Error('expected bullet for point 2')
if (formatted.includes('1) Both')) throw new Error('should strip numbering prefix')

const summary: CuratorRunSummary = {
  bot_id: 'grok',
  lease_ids: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
  items: [
    {
      item_id: 'a',
      queue_kind: 'mint',
      outcome: 'declined',
      label: formatted,
    },
    { item_id: 'b', queue_kind: 'mint', outcome: 'declined', label: 'No shared decision grain' },
    {
      item_id: 'c',
      queue_kind: 'membership',
      outcome: 'membership',
      label: 'Should ODNI declassify UFO records?',
      op_summary: '2× ADMIT, 1× RETYPE_QUESTION',
    },
    {
      item_id: 'd',
      queue_kind: 'membership',
      outcome: 'membership',
      label: 'Did Iraq retain sovereignty after 2003?',
      op_summary: '2× ADMIT',
    },
  ],
}

const text = formatCuratorRunSummaryText(summary)
if (!text.includes('across `mint`, `membership`')) throw new Error('expected both batch kinds in header')
if (!text.includes('*mint*')) throw new Error('expected mint section')
if (!text.includes('*membership*')) throw new Error('expected membership section')
if (!text.includes('Declined: 2')) throw new Error('expected mint decline count')
if (!text.includes('Admitted: 2')) throw new Error('expected membership admit count')
if (!text.includes('Retyped: 1')) throw new Error('expected membership retype count')
if (!text.includes('• Both founding')) throw new Error('expected full rationale in summary')
if (text.includes('rather t…')) throw new Error('should not hard-truncate mid-word at 140')

if (classifyProposalOutcome({ ops: [] }, 'submitted', 'mint') !== 'declined') {
  throw new Error('empty ops on mint queue should be declined')
}
if (classifyProposalOutcome({ ops: [] }, 'submitted', 'membership') !== 'declined') {
  throw new Error('empty ops on membership queue should be declined')
}
if (
  classifyProposalOutcome(
    { ops: [{ type: 'MINT_QUESTION', new_question_text: 'Q?' }] },
    'pending_approval',
    'mint'
  ) !== 'mint'
) {
  throw new Error('MINT op should be mint')
}
if (
  classifyProposalOutcome(
    { ops: [{ type: 'ADMIT' }, { type: 'RETYPE_QUESTION' }] },
    'submitted',
    'membership'
  ) !== 'membership'
) {
  throw new Error('membership ops should be membership outcome')
}

const opSummary = summarizeMembershipOps({
  ops: [{ type: 'ADMIT' }, { type: 'ADMIT' }, { type: 'RETYPE_QUESTION' }],
})
if (!opSummary.includes('2× ADMIT')) throw new Error('expected admit count in op summary')

console.log('test-curator-run-summary: ok')
console.log('--- sample ---')
console.log(text)
