/**
 * Repair orphaned refiner claim versions for one chunk.
 * Usage: npx tsx scripts/relink-chunk-claim-orphans.ts <story_id> <chunk_index>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from '@supabase/supabase-js'
import {
  fetchChunkClaimsLifecycle,
  relinkOrphanedClaimVersion,
} from '../lib/admin/orphaned-claim-versions.ts'

const storyId = process.argv[2]
const chunkIndexRaw = process.argv[3]

if (!storyId || chunkIndexRaw == null) {
  console.error('Usage: npx tsx scripts/relink-chunk-claim-orphans.ts <story_id> <chunk_index>')
  process.exit(1)
}

const chunkIndex = Number(chunkIndexRaw)
if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
  console.error('chunk_index must be a non-negative integer')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const before = await fetchChunkClaimsLifecycle(supabase, storyId, chunkIndex)
if (before.orphaned_versions.length === 0) {
  console.log(`No orphaned claim versions for story ${storyId} chunk ${chunkIndex}`)
  process.exit(0)
}

console.log(`Found ${before.orphaned_versions.length} orphan(s); relinking...`)

for (const orphan of before.orphaned_versions) {
  const result = await relinkOrphanedClaimVersion(supabase, {
    storyId,
    chunkIndex,
    versionId: orphan.version_id,
    reviewArtifactId: orphan.suggested_review_artifact_id,
    refinementArtifactId: orphan.refinement_artifact_id,
  })
  console.log(
    `  relinked ${orphan.version_label} (${orphan.version_id}) -> refinement ${result.refinement_artifact_id}`
  )
}

const after = await fetchChunkClaimsLifecycle(supabase, storyId, chunkIndex)
console.log(`Remaining orphans: ${after.orphaned_versions.length}`)
process.exit(after.orphaned_versions.length > 0 ? 1 : 0)
