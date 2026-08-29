/**
 * Generate per-bot MCP bearer tokens, write a local env file, and seed l3_bots.
 *
 * Usage: npx tsx scripts/generate-l3-mcp-tokens.ts
 * Output: integrations/grok-bots/mcp-tokens.local.env (gitignored)
 */

import { config as loadDotenv } from 'dotenv'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
loadDotenv({ path: path.join(root, '.env.local') })

const BOT_IDS = [
  'curator',
  'editor',
  'auditor',
  'lead-reviewer',
  'acquisition',
] as const

const KIND_BY_BOT_ID: Record<string, string> = {
  provenance: 'provenance',
  acquisition: 'acquisition',
  curator: 'curator',
  editor: 'editor',
  auditor: 'auditor',
  'lead-reviewer': 'lead-reviewer',
  admin: 'admin',
}

function tokenFor(botId: string): string {
  return `doxa_${botId}_${randomBytes(24).toString('base64url')}`
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase url/key in .env.local')

  const pairs = BOT_IDS.map((botId) => [botId, tokenFor(botId)] as const)
  const outDir = path.join(root, 'integrations', 'grok-bots')
  const outFile = path.join(outDir, 'mcp-tokens.local.env')
  fs.mkdirSync(outDir, { recursive: true })

  const lines = [
    '# Generated MCP bearer tokens — paste into xAI Grok MCP connectors. Do not commit.',
    `# Generated: ${new Date().toISOString()}`,
    `DOXA_MCP_URL=${(process.env.DOXA_APP_URL || 'https://doxa-two.vercel.app').replace(/\/$/, '')}/api/mcp/l3`,
    '',
    ...pairs.map(([botId, token]) => `${botId.toUpperCase().replace(/-/g, '_')}_MCP_TOKEN=${token}`),
    '',
    `L3_MCP_TOKENS=${pairs.map(([botId, token]) => `${botId}:${token}`).join(',')}`,
    '',
  ]
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  for (const [botId, token] of pairs) {
    const kind = KIND_BY_BOT_ID[botId] ?? 'curator'
    const token_hash = createHash('sha256').update(token).digest('hex')
    const { error } = await supabase.from('l3_bots').upsert({ bot_id: botId, kind, token_hash })
    if (error) throw error
    console.log(`seeded ${botId} (${kind})`)
  }

  console.log(`\nWrote ${path.relative(root, outFile)}`)
  console.log('Open integrations/grok-bots/README.md for xAI connector steps.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
