/**
 * Unit checks for debate-role routing.
 * Usage: npx tsx scripts/test-debate-role.ts
 */

import { resolveDebateRole } from '../doxa-agents/lib/debate/debate-role.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

assert(
  resolveDebateRole({ speechActs: 'prescription', hasRoles: 'conclusion' }) === 'thesis',
  'prescription+conclusion → thesis'
)
assert(
  resolveDebateRole({ speechActs: 'assertion', hasRoles: 'premise' }) === 'premise',
  'assertion+premise → premise'
)
assert(
  resolveDebateRole({ speechActs: 'judgment', hasRoles: '' }) === 'thesis',
  'judgment → thesis'
)
assert(
  resolveDebateRole({ speechActs: 'assertion', hasRoles: '' }) === 'premise',
  'bare assertion → premise'
)
assert(
  resolveDebateRole({ speechActs: 'definition', hasRoles: '' }) === 'background',
  'definition → background'
)
assert(
  resolveDebateRole({ speechActs: 'question', hasRoles: '' }) === 'background',
  'bare question → background'
)
assert(
  resolveDebateRole({ speechActs: 'other', hasRoles: '' }) === 'background',
  'other → background'
)
assert(
  resolveDebateRole({ speechActs: 'allegation', hasRoles: 'objection' }) === 'thesis',
  'allegation+objection → thesis'
)
assert(
  resolveDebateRole({ speechActs: 'prescription|assertion', hasRoles: 'premise' }) === 'thesis',
  'pipe-separated thesis speech wins'
)

console.log('test-debate-role: ok')
