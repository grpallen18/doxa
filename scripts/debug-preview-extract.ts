/**
 * Preview extract diagnostics (run one step at a time).
 * npm run env:branch && npx tsx scripts/debug-preview-extract.ts ping
 * npm run env:branch && npx tsx scripts/debug-preview-extract.ts skip
 * npm run env:branch && npx tsx scripts/debug-preview-extract.ts extract
 */
import { config as loadDotenv } from 'dotenv'
import { join } from 'node:path'
import { edgeFunctionHeaders } from '../lib/supabase/edge-function-auth.ts'

loadDotenv({ path: join(process.cwd(), '.env.local') })
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  loadDotenv({ path: join(process.cwd(), '.env.local.branch'), override: true })
}

const FIXTURE_ID = process.env.STORY_ID?.trim() || '15208581-91ae-4454-92bf-d7a16d1a6313'
const step = process.argv[2] ?? 'ping'

async function invoke(body: Record<string, unknown>, timeoutMs: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Missing Supabase URL or service key (.env.local.branch + npm run env:branch)')
    process.exit(1)
  }

  const t0 = Date.now()
  const res = await fetch(`${url}/functions/v1/extract_story_claims`, {
    method: 'POST',
    headers: { ...edgeFunctionHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  console.log(`[${step}] ${Date.now() - t0}ms HTTP ${res.status}`)
  console.log(text.slice(0, 1200))
  if (!res.ok) process.exit(1)
}

const bodies: Record<string, Record<string, unknown>> = {
  ping: { ping_openai: true },
  skip: { story_id: FIXTURE_ID, skip_llm: true, max_chunks: 1 },
  extract: { story_id: FIXTURE_ID, max_chunks: 1 },
}

const timeouts: Record<string, number> = {
  ping: 45_000,
  skip: 30_000,
  extract: 160_000,
}

if (!(step in bodies)) {
  console.error('Usage: ping | skip | extract')
  process.exit(1)
}

invoke(bodies[step], timeouts[step]).catch((e) => {
  console.error(e)
  process.exit(1)
})
