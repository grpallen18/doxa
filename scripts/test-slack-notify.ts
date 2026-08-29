/**
 * Diagnose Slack approval card posting. Usage:
 *   npx tsx scripts/test-slack-notify.ts [proposal_uid]
 */
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

async function main() {
  const { postPendingApprovalCard } = await import('../lib/l3/slack-approval.ts')
  const { createAdminClient } = await import('../lib/supabase/server.ts')
  const { loadMintApprovalContext, formatMintApprovalSlackText } = await import(
    '../lib/l3/mint-approval-context.ts'
  )
  const sb = createAdminClient()
  const { data: row } = await sb
    .from('l3_proposals')
    .select('proposal_uid, kind, payload')
    .eq('proposal_uid', proposalUid)
    .maybeSingle()
  if (row) {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const ctx = await loadMintApprovalContext(payload)
    const text = formatMintApprovalSlackText({ kind: String(row.kind), payload, context: ctx })
    console.log('formatted card length:', text.length)
  }
  const result = await postPendingApprovalCard(proposalUid)
  console.log('postPendingApprovalCard:', JSON.stringify(result, null, 2))
  if (!result.ok && !result.skipped) {
    process.exit(1)
  }
}

main()
