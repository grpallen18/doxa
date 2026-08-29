/**
 * Membership gold: group cq-propositions by question; report foreign-member rate vs live Neo.
 * Usage: npx tsx scripts/eval-membership-gold.ts
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import neo4j from 'neo4j-driver'
import { fileURLToPath } from 'url'
import {
  ensureQuestionMark,
  normalizeQuestionText,
  questionUidFromText,
} from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

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
  const rows = parseCsv(
    fs.readFileSync(path.join(REPO_ROOT, 'docs', 'gold', 'cq-propositions.csv'), 'utf8')
  ).filter((r) => (r.debate_role || '').trim() === 'thesis' && (r.question || '').toLowerCase() !== 'none')

  const gold = new Map<string, Set<string>>()
  for (const row of rows) {
    const q = ensureQuestionMark((row.question || '').trim())
    if (!q) continue
    const key = normalizeQuestionText(q)
    if (!gold.has(key)) gold.set(key, new Set())
    gold.get(key)!.add(row.proposition_uid)
  }

  const uri = process.env.NEO4J_URI?.trim()
  if (!uri) {
    console.log(`Gold questions=${gold.size} (no Neo — offline inventory only)`)
    console.log('eval-membership-gold: ok (offline)')
    return
  }

  const driver = neo4j.driver(
    uri,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
    { disableLosslessIntegers: true }
  )
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })
  let foreign = 0
  let liveMembers = 0
  let compared = 0
  try {
    for (const [norm, expected] of gold) {
      const uid = await questionUidFromText(norm.endsWith('?') ? norm : `${norm}?`)
      const res = await session.run(
        `MATCH (p:Proposition)-[:ANSWERS]->(q:Question {uid: $uid}) RETURN p.uid AS uid`,
        { uid }
      )
      const live = new Set(res.records.map((r) => String(r.get('uid'))))
      if (!live.size) continue
      compared += 1
      liveMembers += live.size
      for (const m of live) if (!expected.has(m)) foreign += 1
    }
  } finally {
    await session.close()
    await driver.close()
  }
  const rate = liveMembers ? foreign / liveMembers : 0
  console.log(
    `compared=${compared} live_members=${liveMembers} foreign=${foreign} foreign_member_rate=${rate.toFixed(3)}`
  )
  if (liveMembers >= 10 && rate > 0.05) {
    console.error('foreign-member rate above 5%')
    process.exit(1)
  }
  console.log('eval-membership-gold: ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
