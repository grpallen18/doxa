/**
 * Story step run outcome helpers — run: npx tsx scripts/test-story-step-runs.ts
 *
 * Manual verification (after migration 164/165 applied):
 * 1. Admin Run extract-story-claims on one story until chunks have extraction_json.
 * 2. Query story_step_runs / story_step_latest — expect looping until validate passes, then success.
 * 3. Revert a step — latest row for that step_id should clear.
 * 4. Failed admin Run — run-step appends outcome=failure with trigger=admin.
 */
import {
  buildBatchSummariesFromProcessedChunks,
  groupChunkResultsByStory,
  inferBatchStoryOutcome,
  resolveStoryStepTrigger,
} from '../doxa-agents/lib/story-step-runs.ts'

let passed = 0
let failed = 0

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++
    console.log(`  ok ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}`)
  }
}

console.log('inferBatchStoryOutcome')
assert('error => failure', inferBatchStoryOutcome({ processed: 1, error: 'boom' }) === 'failure')
assert('skipped => skipped', inferBatchStoryOutcome({ processed: 0, skipped: true }) === 'skipped')
assert('zero processed => no_op', inferBatchStoryOutcome({ processed: 0 }) === 'no_op')
assert('blocked => failure', inferBatchStoryOutcome({ processed: 2, blocked: true }) === 'failure')
assert('step complete => success', inferBatchStoryOutcome({ processed: 1, stepComplete: true }) === 'success')
assert('partial batch => looping', inferBatchStoryOutcome({ processed: 3 }) === 'looping')

console.log('resolveStoryStepTrigger')
assert('scoped story => admin', resolveStoryStepTrigger('uuid') === 'admin')
assert('cron batch => cron', resolveStoryStepTrigger(null) === 'cron')

console.log('groupChunkResultsByStory')
const grouped = groupChunkResultsByStory([
  { story_id: 'a', chunk_index: 0 },
  { story_id: 'a', chunk_index: 2 },
  { story_id: 'b', chunk_index: 1 },
])
assert('groups two stories', grouped.size === 2)
assert('story a indices', JSON.stringify(grouped.get('a')) === '[0,2]')

console.log('buildBatchSummariesFromProcessedChunks')
const summaries = buildBatchSummariesFromProcessedChunks(
  [
    { story_id: 's1', chunk_index: 0 },
    { story_id: 's1', chunk_index: 1 },
  ],
  {
    stepCompleteByStory: new Map([['s1', false]]),
    blockedByStory: new Map([['s1', false]]),
  }
)
assert('one summary row', summaries.length === 1)
assert('processed count', summaries[0]?.processed === 2)
assert('outcome looping via infer', inferBatchStoryOutcome(summaries[0]!) === 'looping')

console.log('')
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`)
  process.exit(1)
}
console.log(`All ${passed} assertions passed.`)
