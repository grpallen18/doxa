/**
 * Unit checks for editor/auditor run summary formatting.
 * Usage: npx tsx scripts/test-worker-run-summary.ts
 */

import {
  formatAuditorRunSummaryText,
  formatEditorRunSummaryText,
} from '../lib/l3/worker-run-summary-format.ts'

const editorText = formatEditorRunSummaryText({
  worker: 'editor',
  bot_id: 'editor',
  run_id: '00000000-0000-4000-8000-000000000001',
  buckets_scanned: 2,
  items: [
    {
      question_uid: 'cq:odni',
      polarity: 'FAVOR',
      question_text: 'Should ODNI be substantially downsized?',
      outcome: 'submitted',
      cluster_count: 1,
      key_points: ['Downsizing is needed to cut bureaucracy'],
    },
    {
      question_uid: 'cq:iraq',
      polarity: 'DENIES',
      question_text: 'Did US-Saudi strikes violate Iraqi sovereignty?',
      outcome: 'submitted',
      cluster_count: 1,
      key_points: ['Precision strikes were a limited response'],
    },
  ],
})

if (!editorText.includes('*Editor run complete*')) throw new Error('editor header')
if (!editorText.includes('No Slack approval needed')) throw new Error('editor auto-apply note')
if (!editorText.includes('1 cluster(s)')) throw new Error('expected cluster hint')

const auditorText = formatAuditorRunSummaryText({
  worker: 'auditor',
  bot_id: 'auditor',
  run_id: '00000000-0000-4000-8000-000000000002',
  pending_scanned: 1,
  items: [
    {
      controversy_uid: 'ctr_odni',
      question_uid: 'cq:odni',
      question_text: 'Should ODNI be substantially downsized?',
      outcome: 'submitted',
      verdict: 'pass',
      reason: 'Both sides answer whether ODNI should be downsized; spans conflict on scope.',
      weakest_member_uid: 'prop:warner',
    },
    {
      controversy_uid: 'ctr_iraq',
      question_uid: 'cq:iraq',
      question_text: 'Did US-Saudi strikes violate Iraqi sovereignty?',
      outcome: 'submitted',
      verdict: 'block',
      reason: 'Sides are answering different decisions about calendar vs sovereignty.',
      weakest_member_uid: 'prop:centcom',
    },
  ],
})

if (!auditorText.includes('*Auditor run complete*')) throw new Error('auditor header')
if (!auditorText.includes('Pass: 1 · Block: 1')) throw new Error('auditor counts')
if (!auditorText.includes('*block*')) throw new Error('block tag')

const idleText = formatAuditorRunSummaryText({
  worker: 'auditor',
  bot_id: 'grok',
  run_id: '00000000-0000-4000-8000-000000000003',
  pending_scanned: 0,
  items: [],
  idle_note: 'Nothing to audit — waiting on curator/editor.',
})

if (!idleText.includes('Nothing to audit')) throw new Error('idle note')
if (idleText.includes('auto-apply')) throw new Error('idle should omit auto-apply note')

console.log('test-worker-run-summary: ok')
console.log('--- editor sample ---')
console.log(editorText)
console.log('--- auditor sample ---')
console.log(auditorText)
console.log('--- auditor idle sample ---')
console.log(idleText)
