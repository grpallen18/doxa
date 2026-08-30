/**
 * Unit checks for curator run summary formatting.
 * Usage: npx tsx scripts/test-curator-run-summary.ts
 */

import {
  classifyProposalOutcome,
  formatCuratorRunSummaryText,
} from '../lib/l3/curator-run-summary-format.ts'
import type { CuratorRunSummary } from '../lib/l3/curator-run-summary-format.ts'

const summary: CuratorRunSummary = {
  bot_id: 'grok',
  lease_id: '00000000-0000-4000-8000-000000000001',
  batch_kind: 'mint',
  items: [
    { item_id: 'a', outcome: 'declined', label: 'Allen / Polhamus — same-side LWOP cluster' },
    { item_id: 'b', outcome: 'declined', label: 'No shared decision grain' },
    {
      item_id: 'c',
      outcome: 'mint',
      label: 'Did CNN misreport steel tariff consumer price impact?',
    },
    { item_id: 'd', outcome: 'blocked', label: 'Auto-review denied submit' },
  ],
}

const text = formatCuratorRunSummaryText(summary)
if (!text.includes('Minted: 1')) throw new Error('expected mint count')
if (!text.includes('Declined: 2')) throw new Error('expected decline count')
if (!text.includes('Blocked: 1')) throw new Error('expected blocked count')
if (!text.includes('*mint*')) throw new Error('expected mint line')

if (classifyProposalOutcome({ ops: [] }, 'submitted') !== 'declined') {
  throw new Error('empty ops should be declined')
}
if (
  classifyProposalOutcome(
    { ops: [{ type: 'MINT_QUESTION', new_question_text: 'Q?' }] },
    'pending_approval'
  ) !== 'mint'
) {
  throw new Error('MINT op should be mint')
}

console.log('test-curator-run-summary: ok')
console.log('--- sample ---')
console.log(text)
