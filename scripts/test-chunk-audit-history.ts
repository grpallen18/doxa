/**
 * Chunk-scoped pipeline audit filtering — run: npx tsx scripts/test-chunk-audit-history.ts
 */
import { rowMatchesChunkHistory } from '../lib/admin/history.ts'

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

type Row = Parameters<typeof rowMatchesChunkHistory>[0]

function row(overrides: Partial<Row> & Pick<Row, 'label'>): Row {
  return {
    id: '1',
    at: '2026-01-01T00:00:00Z',
    eventType: 'pipeline_step',
    label: overrides.label,
    detail: 'validate-chunk-claims',
    meta: {},
    actorId: null,
    source: null,
    ...overrides,
  }
}

console.log('rowMatchesChunkHistory')
assert(
  'matches chunk_index',
  rowMatchesChunkHistory(row({ label: 'Pipeline step run', meta: { chunk_index: 2 } }), 2)
)
assert(
  'rejects other chunk_index',
  !rowMatchesChunkHistory(row({ label: 'Pipeline step run', meta: { chunk_index: 1 } }), 2)
)
assert(
  'matches chunk_indices array',
  rowMatchesChunkHistory(
    row({ label: 'Pipeline step run', meta: { chunk_indices: [0, 2] } }),
    2
  )
)
assert(
  'no chunk meta does not match',
  !rowMatchesChunkHistory(row({ label: 'Pipeline step run', meta: {} }), 0)
)

console.log('')
if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`)
  process.exit(1)
}
console.log(`All ${passed} assertions passed.`)
