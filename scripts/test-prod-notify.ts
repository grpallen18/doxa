import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq <= 0) continue
  const key = trimmed.slice(0, eq)
  const val = trimmed.slice(eq + 1)
  if (!process.env[key]) process.env[key] = val
}

const proposalUid = process.argv[2] ?? 'mcp:grok:1788038124365'
const secret = process.env.SLACK_NOTIFY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
const url = `${(process.env.DOXA_APP_URL || 'https://doxa-two.vercel.app').replace(/\/$/, '')}/api/slack/notify`

async function main() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ proposal_uid: proposalUid }),
  })
  const body = await res.text()
  console.log('status:', res.status)
  console.log('body:', body.slice(0, 500))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
