/**
 * Offline curator prompt regression: dossiers from gold CSV, no writes.
 * Usage: npx tsx scripts/eval-l3-curator-regression.ts
 *
 * Requires LLM_API_KEY or OPENAI_API_KEY. Skip (exit 0) if unset.
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chatJson, llmConfigFromEnv } from '../doxa-agents/lib/debate/llm.ts'
import { CURATOR_SYSTEM } from '../doxa-agents/lib/debate/prompts.ts'
import { normalizeOp } from '../doxa-agents/lib/debate/proposal-ops.ts'
import { ensureQuestionMark } from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ',') {
      cur.push(field)
      field = ''
      continue
    }
    if (c === '\n') {
      cur.push(field)
      field = ''
      if (cur.length > 1 || cur[0] !== '') rows.push(cur)
      cur = []
      continue
    }
    if (c === '\r') continue
    field += c
  }
  if (field.length || cur.length) {
    cur.push(field)
    rows.push(cur)
  }
  const headers = rows[0]
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cells[i] ?? ''
    return obj
  })
}

async function main() {
  const llm = llmConfigFromEnv(process.env)
  if (!llm) {
    console.log('eval-l3-curator-regression: skipped (no LLM key)')
    return
  }
  const rows = parseCsv(
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'gold', 'cq-propositions.csv'), 'utf8')
  ).filter((r) => (r.debate_role || '').trim() === 'thesis')
  const byQ = new Map<string, typeof rows>()
  for (const row of rows) {
    const q = ensureQuestionMark((row.question || '').trim())
    if (!q || q.toLowerCase() === 'none') continue
    if (!byQ.has(q)) byQ.set(q, [])
    byQ.get(q)!.push(row)
  }
  const sample = [...byQ.entries()].filter(([, v]) => v.length >= 2).slice(0, 2)
  if (!sample.length) {
    console.log('eval-l3-curator-regression: no multi-member gold questions')
    return
  }
  for (const [question, members] of sample) {
    const dossier = {
      question: { uid: 'cq:gold', text: question, type: members[0].question_type },
      members: members.map((m) => ({
        prop_uid: m.proposition_uid,
        text: m.text,
        polarity: m.polarity,
        utterance_uid: 'utt:gold',
        segment_text: m.text,
      })),
      candidates: [],
    }
    const result = await chatJson<Record<string, unknown>>(llm, CURATOR_SYSTEM, dossier)
    const ops = Array.isArray(result.parsed.ops)
      ? result.parsed.ops
          .map((o) => normalizeOp((o ?? {}) as Record<string, unknown>))
          .filter((o): o is NonNullable<typeof o> => o != null)
      : []
    console.log(`${question.slice(0, 60)} → ${ops.length} ops`)
    const uncited = ops.filter((o) => !o.cited_utterance_uids.length)
    if (uncited.length) {
      throw new Error('curator returned uncited ops')
    }
  }
  console.log('eval-l3-curator-regression: ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
