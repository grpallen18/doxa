/**
 * Refine claim-id remap — run: npx tsx scripts/test-remap-refined-claim-ids.ts
 */
import {
  assertClaimIdsSubsetOf,
  remapRefinedClaimIds,
} from '../doxa-agents/lib/extraction-qa/claim-ids.ts'

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL: ${label}`)
    process.exitCode = 1
    throw new Error(label)
  }
  console.log(`ok: ${label}`)
}

const ID_210 = 'cc_d9a585881e1e363f'
const ID_TRUMP = 'cc_be8c728061e9193d'

const inputs = [
  {
    claim_id: ID_210,
    raw_text: 'Trump said that Pulte can serve in the role for 210 days.',
  },
  {
    claim_id: ID_TRUMP,
    raw_text: 'Trump suggested that his political opponents should be removed from the ODNI.',
  },
]

{
  const swapped = remapRefinedClaimIds(
    [
      {
        claim_id: ID_TRUMP,
        raw_text: inputs[0].raw_text,
      },
      {
        claim_id: 'cc_01fad0b586743305',
        raw_text: inputs[1].raw_text,
      },
    ],
    inputs
  )

  assert('swap: 210-day keeps original id', swapped.claims[0]?.claim_id === ID_210)
  assert('swap: Trump keeps original id', swapped.claims[1]?.claim_id === ID_TRUMP)
  assert('swap: no extras dropped', swapped.droppedExtras === 0)
}

{
  const equalOrder = remapRefinedClaimIds(
    [
      { claim_id: 'cc_wrong1', raw_text: inputs[0].raw_text },
      { claim_id: 'cc_wrong2', raw_text: inputs[1].raw_text },
    ],
    inputs
  )
  assert('exact text forces input ids', equalOrder.claims[0]?.claim_id === ID_210)
  assert('exact text forces second id', equalOrder.claims[1]?.claim_id === ID_TRUMP)
}

{
  const dropped = remapRefinedClaimIds(
    [{ claim_id: 'cc_new', raw_text: inputs[1].raw_text }],
    inputs
  )
  assert(
    'drop keeps matching input id',
    dropped.claims.length === 1 && dropped.claims[0]?.claim_id === ID_TRUMP
  )
}

{
  const extras = remapRefinedClaimIds(
    [
      { claim_id: 'a', raw_text: inputs[0].raw_text },
      { claim_id: 'b', raw_text: inputs[1].raw_text },
      { claim_id: 'c', raw_text: 'Completely invented third claim about something else.' },
    ],
    inputs
  )
  assert('extras: keeps only repair-queue size', extras.claims.length === 2)
  assert('extras: dropped at least one', extras.droppedExtras >= 1)
  assert(
    'extras: ids stay in input set',
    extras.claims.every((c) => c.claim_id === ID_210 || c.claim_id === ID_TRUMP)
  )
}

{
  assertClaimIdsSubsetOf([{ claim_id: ID_210 }, { claim_id: ID_TRUMP }], [ID_210, ID_TRUMP])
  let threw = false
  try {
    assertClaimIdsSubsetOf([{ claim_id: 'cc_01fad0b586743305' }], [ID_210, ID_TRUMP])
  } catch (error) {
    threw = error instanceof Error && error.message.includes('refiner_claim_id_drift')
  }
  assert('drift guard rejects minted ids', threw)
}

console.log('all remap refined claim id checks passed')
