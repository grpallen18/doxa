/**
 * Preview-only: extract claims for one story (no validate/merge).
 * Run: npm run env:branch && npm run preview:extract-claims
 */
import { config as loadDotenv } from 'dotenv'
import { join } from 'node:path'
import { edgeFunctionHeaders } from '../lib/supabase/edge-function-auth.ts'

loadDotenv({ path: join(process.cwd(), '.env.local') })
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  loadDotenv({ path: join(process.cwd(), '.env.local.branch'), override: true })
}

const FIXTURE_ID = process.env.STORY_ID?.trim() || '15208581-91ae-4454-92bf-d7a16d1a6313'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Set credentials in .env.local.branch, then npm run env:branch')
    process.exit(1)
  }

  const res = await fetch(`${url}/functions/v1/extract_story_claims`, {
    method: 'POST',
    headers: {
      ...edgeFunctionHeaders(key),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ story_id: FIXTURE_ID, max_chunks: 1 }),
  })

  const text = await res.text()
  console.log(res.status, text.slice(0, 800))
  if (!res.ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
