/**
 * Upsert L3 MCP bot token hashes (manual / CI).
 *
 * Usage:
 *   DOXA_MCP_TOKEN=secret npx tsx scripts/seed-l3-bots.ts
 *   L3_MCP_TOKENS=grok:secret npx tsx scripts/seed-l3-bots.ts   # legacy multi-bot form
 *
 * Prefer: npx tsx scripts/generate-l3-mcp-tokens.ts
 */

import { config as loadDotenv } from 'dotenv'
import { createHash } from 'node:crypto'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

const KIND_BY_BOT_ID: Record<string, string> = {
  grok: 'grok',
  provenance: 'provenance',
  acquisition: 'acquisition',
  curator: 'curator',
  editor: 'editor',
  auditor: 'auditor',
  'lead-reviewer': 'lead-reviewer',
  admin: 'admin',
}

function kindFor(botId: string): string {
  if (KIND_BY_BOT_ID[botId]) return KIND_BY_BOT_ID[botId]
  if (botId.includes('audit')) return 'auditor'
  if (botId.includes('edit')) return 'editor'
  if (botId.includes('acq')) return 'acquisition'
  if (botId.includes('review')) return 'lead-reviewer'
  if (botId.includes('prov')) return 'provenance'
  return 'curator'
}

async function main() {
  const shared = (process.env.DOXA_MCP_TOKEN ?? '').trim()
  const raw = shared ? `grok:${shared}` : (process.env.L3_MCP_TOKENS ?? '').trim()
  if (!raw) {
    console.log('Set DOXA_MCP_TOKEN=... or L3_MCP_TOKENS=botId:token,...')
    return
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing supabase url/key')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  for (const part of raw.split(',')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const botId = part.slice(0, colon).trim()
    const token = part.slice(colon + 1).trim()
    if (!botId || !token) continue
    const kind = kindFor(botId)
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
