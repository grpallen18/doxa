/**
 * Generate the shared Grok MCP bearer token and seed l3_bots.
 *
 * Usage: npx tsx scripts/generate-l3-mcp-tokens.ts
 * Output: integrations/grok-bots/mcp-tokens.local.env (gitignored)
 *
 * All Grok personas share one xAI MCP connector → one token (bot_id `grok`).
 * Persona-specific bot rows (curator, editor, …) remain for workers/cron;
 * their MCP token hashes are cleared so only DOXA_MCP_TOKEN authenticates.
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

/** Worker/cron bot ids — not used for xAI MCP auth after single-token migration. */
const LEGACY_MCP_BOT_IDS = [
  'curator',
  'editor',
  'auditor',
  'lead-reviewer',
  'acquisition',
] as const

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

function sharedMcpToken(): string {
  return `doxa_mcp_${randomBytes(24).toString('base64url')}`
}

function unusableHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex')
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase url/key in .env.local')

  const token = sharedMcpToken()
  const outDir = path.join(root, 'integrations', 'grok-bots')
  const outFile = path.join(outDir, 'mcp-tokens.local.env')
  fs.mkdirSync(outDir, { recursive: true })

  const mcpUrl = `${(process.env.DOXA_APP_URL || 'https://doxa-two.vercel.app').replace(/\/$/, '')}/api/mcp/l3`
  const lines = [
    '# Shared Grok MCP bearer token — paste into the xAI MCP connector. Do not commit.',
    `# Generated: ${new Date().toISOString()}`,
    `DOXA_MCP_URL=${mcpUrl}`,
    `DOXA_MCP_TOKEN=${token}`,
    '',
  ]
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const token_hash = createHash('sha256').update(token).digest('hex')
  const { error: grokErr } = await supabase.from('l3_bots').upsert({
    bot_id: 'grok',
    kind: 'grok',
    token_hash,
  })
  if (grokErr) throw grokErr
  console.log('seeded grok (shared MCP token)')

  for (const botId of LEGACY_MCP_BOT_IDS) {
    const kind = KIND_BY_BOT_ID[botId] ?? 'curator'
    const { error } = await supabase.from('l3_bots').upsert({
      bot_id: botId,
      kind,
      token_hash: unusableHash(),
    })
    if (error) throw error
    console.log(`invalidated legacy MCP token for ${botId} (${kind})`)
  }

  console.log(`\nWrote ${path.relative(root, outFile)}`)
  console.log('Paste DOXA_MCP_TOKEN into your xAI MCP connector (Bearer auth).')
  console.log('Open integrations/grok-bots/README.md for persona prompts.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
