/**
 * Seed :Question registry from approved gold CSVs (local OpenAI + Neo4j).
 * Usage: npx tsx scripts/seed-question-registry.ts
 *
 * Requires OPENAI_API_KEY and NEO4J_* in .env.local.
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { fileURLToPath } from 'url'
import {
  EMBEDDING_MODEL,
  QUESTION_SCHEMA_VERSION,
  embedTexts,
  ensureQuestionMark,
  normalizeQuestionText,
  parseExclusivity,
  parseQuestionType,
  questionUidFromText,
} from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PROPS_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-propositions.csv')
const PAIRS_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-question-pairs.csv')

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

async function ensureConstraints(session: neo4j.Session) {
  await session.run(`
    CREATE CONSTRAINT question_uid IF NOT EXISTS
    FOR (q:Question) REQUIRE q.uid IS UNIQUE
  `)
  await session.run(`CREATE INDEX question_status IF NOT EXISTS FOR (q:Question) ON (q.status)`)
  await session.run(`CREATE INDEX question_type IF NOT EXISTS FOR (q:Question) ON (q.questionType)`)
}

async function main() {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY in .env.local')

  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'
  if (!uri || !username || !password) {
    throw new Error('Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in .env.local')
  }

  const byNorm = new Map<
    string,
    { question: string; questionType: string; exclusivity: string }
  >()

  for (const row of parseCsv(fs.readFileSync(PROPS_PATH, 'utf8'))) {
    if ((row.debate_role || '').trim() !== 'thesis') continue
    const q = ensureQuestionMark((row.question || '').trim())
    if (!q || q.toLowerCase() === 'none') continue
    const norm = normalizeQuestionText(q)
    const existing = byNorm.get(norm)
    const qt = parseQuestionType(row.question_type) ?? ''
    const ex = parseExclusivity(row.exclusivity) ?? ''
    if (!existing) {
      byNorm.set(norm, { question: q, questionType: qt, exclusivity: ex })
    } else {
      if (!existing.questionType && qt) existing.questionType = qt
      if (!existing.exclusivity && ex) existing.exclusivity = ex
    }
  }

  for (const row of parseCsv(fs.readFileSync(PAIRS_PATH, 'utf8'))) {
    for (const col of ['question_a', 'question_b'] as const) {
      const q = ensureQuestionMark((row[col] || '').trim())
      if (!q) continue
      const norm = normalizeQuestionText(q)
      if (!byNorm.has(norm)) {
        byNorm.set(norm, { question: q, questionType: '', exclusivity: '' })
      }
    }
  }

  const questions = [...byNorm.values()]
  console.log(`Seeding ${questions.length} Questions locally…`)

  const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database })

  try {
    await ensureConstraints(session)
    console.log('Question constraints/indexes ensured')

    const BATCH = 80
    let upserted = 0
    for (let i = 0; i < questions.length; i += BATCH) {
      const slice = questions.slice(i, i + BATCH)
      const embeddings = await embedTexts(
        apiKey,
        slice.map((q) => q.question),
        EMBEDDING_MODEL
      )

      for (let j = 0; j < slice.length; j++) {
        const item = slice[j]
        const embedding = embeddings[j]
        if (!embedding?.length) continue
        const uid = await questionUidFromText(item.question)
        await session.run(
          `
          MERGE (q:Question {uid: $uid})
          ON CREATE SET
            q.createdAt = datetime(),
            q.status = 'developing',
            q.confidence = 1.0
          SET q.question = $question,
              q.questionType = CASE WHEN $questionType <> '' THEN $questionType
                                   ELSE coalesce(q.questionType, 'unknown') END,
              q.answerExclusivity = CASE WHEN $exclusivity <> '' THEN $exclusivity
                                        ELSE coalesce(q.answerExclusivity, 'unknown') END,
              q.embedding = $embedding,
              q.schemaVersion = $schemaVersion,
              q.seededFromGold = true,
              q.updatedAt = datetime()
          `,
          {
            uid,
            question: item.question,
            questionType: item.questionType,
            exclusivity: item.exclusivity,
            embedding,
            schemaVersion: QUESTION_SCHEMA_VERSION,
          }
        )
        upserted += 1
      }
      console.log(`batch ${Math.floor(i / BATCH) + 1}: upserted ${slice.length}`)
    }

    const count = await session.run('MATCH (q:Question) RETURN count(q) AS n')
    console.log(`Done. upserted=${upserted} registry_size=${count.records[0].get('n')}`)
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
