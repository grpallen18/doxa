/**
 * Evaluate controversy qualification against approved gold propositions.
 * Usage: npx tsx scripts/eval-controversy-gold.ts
 *
 * Requires OPENAI_API_KEY only for optional live Neo check (NEO4J_*).
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { fileURLToPath } from 'url'
import {
  evaluateQuestionControversy,
  ESTABLISH_MIN_CONFIDENCE,
} from '../doxa-agents/lib/debate/qualify-controversy.ts'
import {
  ensureQuestionMark,
  normalizeQuestionText,
  parseExclusivity,
  parseQuestionType,
} from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PROPS_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-propositions.csv')

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

function parsePolarity(raw: string): string {
  return raw.trim().toUpperCase()
}

function isProSide(p: string): boolean {
  return p === 'FAVOR' || p === 'AFFIRMS'
}

function isConSide(p: string): boolean {
  return p === 'AGAINST' || p === 'DENIES'
}

async function main() {
  const rows = parseCsv(fs.readFileSync(PROPS_PATH, 'utf8')).filter(
    (r) => (r.debate_role || '').trim() === 'thesis'
  )

  type Agg = {
    question: string
    questionType: string
    exclusivity: string
    assignments: Array<{ propUid: string; polarity: string; confidence: number }>
  }

  const byQ = new Map<string, Agg>()
  for (const row of rows) {
    const q = ensureQuestionMark((row.question || '').trim())
    if (!q || q.toLowerCase() === 'none') continue
    const pol = parsePolarity(row.polarity || '')
    if (!pol || pol === 'NONE' || pol === 'UNCERTAIN') continue
    const norm = normalizeQuestionText(q)
    let agg = byQ.get(norm)
    if (!agg) {
      agg = {
        question: q,
        questionType: parseQuestionType(row.question_type) ?? 'unknown',
        exclusivity: parseExclusivity(row.exclusivity) ?? 'unknown',
        assignments: [],
      }
      byQ.set(norm, agg)
    }
    agg.assignments.push({
      propUid: row.proposition_uid,
      polarity: pol,
      confidence: ESTABLISH_MIN_CONFIDENCE,
    })
  }

  const failures: string[] = []
  let positiveOk = 0
  let negativeOk = 0

  for (const [, agg] of byQ) {
    const pro = agg.assignments.filter((a) => isProSide(a.polarity))
    const con = agg.assignments.filter((a) => isConSide(a.polarity))
    const hasBothSides = pro.length > 0 && con.length > 0
    const result = evaluateQuestionControversy({
      questionUid: `cq:gold:${normalizeQuestionText(agg.question).slice(0, 16)}`,
      questionType: agg.questionType,
      answerExclusivity: agg.exclusivity,
      assignments: agg.assignments.map((a) => ({
        propUid: a.propUid,
        polarity: a.polarity as Parameters<typeof evaluateQuestionControversy>[0]['assignments'][0]['polarity'],
        confidence: a.confidence,
        debateRole: 'thesis',
      })),
    })

    const expectQualify =
      agg.questionType !== 'definitional' &&
      (
        hasBothSides ||
        (agg.questionType === 'causal' && agg.exclusivity === 'compatible' && pro.length >= 2)
      )

    if (expectQualify) {
      if (!result.qualifies) {
        failures.push(`expected qualify: "${agg.question.slice(0, 60)}" → ${result.reason}`)
      } else positiveOk += 1
    } else if (!hasBothSides) {
      if (result.qualifies) {
        failures.push(`unexpected qualify: "${agg.question.slice(0, 60)}" → ${result.reason}`)
      } else negativeOk += 1
    }
  }

  console.log(`Gold aggregate: ${byQ.size} questions; positive ok=${positiveOk}; negative ok=${negativeOk}`)

  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'

  if (uri && username && password) {
    const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      disableLosslessIntegers: true,
    })
    const session = driver.session({ database })
    try {
      const ctr = await session.run(`
        MATCH (c:Controversy)-[:ABOUT]->(q:Question)
        WHERE c.status = 'established'
        RETURN count(c) AS n
      `)
      const n = Number(ctr.records[0]?.get('n') ?? 0)
      console.log(`Live Neo established Controversies: ${n}`)
      if (n === 0) {
        console.log('  (run debate_pipeline batches first if you expect live overlays)')
      } else {
        const sample = await session.run(`
          MATCH (c:Controversy)-[:ABOUT]->(q:Question)
          WHERE c.status = 'established'
          MATCH (p:Proposition)-[a:ANSWERS]->(q)
          WHERE a.polarity IN ['FAVOR','AGAINST','AFFIRMS','DENIES']
          RETURN q.question AS question, c.uid AS ctrUid,
                 collect(DISTINCT a.polarity) AS polarities
          LIMIT 5
        `)
        for (const r of sample.records) {
          console.log(
            `  ${String(r.get('ctrUid'))}: ${String(r.get('question')).slice(0, 50)} polarities=${JSON.stringify(r.get('polarities'))}`
          )
        }
      }
    } finally {
      await session.close()
      await driver.close()
    }
  }

  if (failures.length) {
    console.error('\nFAILURES:')
    for (const f of failures.slice(0, 20)) console.error(` - ${f}`)
    process.exit(1)
  }
  console.log('eval-controversy-gold: ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
