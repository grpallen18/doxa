/**
 * Upsert L3 MCP bot token hashes.
 * Usage: npx tsx scripts/seed-l3-bots.ts
 * Env: L3_MCP_TOKENS="acquisition:secret,curator:secret,admin:secret"
 */

import { config as loadDotenv } from 'dotenv'
import { createHash } from 'node:crypto'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

async function main() {
  const raw = (process.env.L3_MCP_TOKENS ?? '').trim()
  if (!raw) {
    console.log('Set L3_MCP_TOKENS=botId:token,...')
    return
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing supabase url/key')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  for (const part of raw.split(',')) {
    const [botId, token] = part.split(':').map((s) => s.trim())
    if (!botId || !token) continue
    const kind =
      botId.includes('audit')
        ? 'auditor'
        : botId.includes('edit')
          ? 'editor'
          : botId.includes('acq')
            ? 'acquisition'
            : 'curator'
    const token_hash = createHash('sha256').update(token).digest('hex')
    const { error } = await supabase.from('l3_bots').upsert({
      bot_id: botId,
      kind,
      token_hash,
    })
    if (error) throw error
    console.log(`upserted ${botId} (${kind})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
