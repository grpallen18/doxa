/**
 * Evaluate Question retrieve/adjudicate against approved gold pairs (+ sample props).
 * Usage: npx tsx scripts/eval-question-gold.ts
 *
 * Requires OPENAI_API_KEY (and optionally Neo for live registry check) in .env.local.
 * Exit 1 if same-labeled pairs collapse incorrectly or adjacent pairs share a uid.
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { fileURLToPath } from 'url'
import {
  EMBEDDING_MODEL,
  SAME_MATCH_MIN_CONFIDENCE,
  TOP_K_QUESTIONS,
  cosineSimilarity,
  embedTexts,
  ensureQuestionMark,
  normalizeQuestionText,
  parseMatchLabel,
  questionUidFromText,
  resolveMatchLabel,
  type QuestionMatchLabel,
} from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PAIRS_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-question-pairs.csv')
const PROPS_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-propositions.csv')

loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

const MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

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

async function adjudicate(
  apiKey: string,
  candidate: string,
  option: string
): Promise<{ label: QuestionMatchLabel; confidence: number }> {
  const system = `Compare two contested questions.
Return ONLY JSON: {"label":"same|adjacent|unrelated","confidence":0.0-1.0}
- same = same contested decision; synonym/paraphrase OK (e.g. United States↔Washington, military aid↔weapons to Kyiv)
- adjacent = related topic but a *different* decision (must not merge)
- unrelated = different topic
Always adjacent (never same): "primary cause" vs open "what caused"; policy should-we vs prediction will-X; competence/quality vs should-we; reconstruction financing vs continue military aid; race in admissions vs "is affirmative action fair"
If it is only a wording swap of the same decision → same. Prefer adjacent when the decision criteria differ.`
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ candidate, option }) },
      ],
    }),
  })
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`)
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  return resolveMatchLabel(
    candidate,
    option,
    parseMatchLabel(parsed.label),
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5
  )
}

async function main() {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY in .env.local')

  const pairs = parseCsv(fs.readFileSync(PAIRS_PATH, 'utf8'))
  const failures: string[] = []
  let pairOk = 0

  console.log(`Evaluating ${pairs.length} gold question pairs…`)
  for (const row of pairs) {
    const a = ensureQuestionMark((row.question_a || '').trim())
    const b = ensureQuestionMark((row.question_b || '').trim())
    const gold = (row.label || '').trim().toLowerCase() as QuestionMatchLabel
    if (!a || !b || !gold) continue

    const uidA = await questionUidFromText(a)
    const uidB = await questionUidFromText(b)
    const [embA, embB] = await embedTexts(apiKey, [a, b], EMBEDDING_MODEL)
    const cos = cosineSimilarity(embA, embB)
    const adj = await adjudicate(apiKey, a, b)

    const wouldMerge =
      adj.label === 'same' && adj.confidence >= SAME_MATCH_MIN_CONFIDENCE

    if (gold === 'same') {
      if (!wouldMerge && uidA !== uidB) {
        // Exact-normalized same uid is also OK; otherwise adjudicator must say same.
        if (normalizeQuestionText(a) !== normalizeQuestionText(b)) {
          failures.push(
            `same-pair not merged: "${a}" vs "${b}" → ${adj.label}@${adj.confidence.toFixed(2)} cos=${cos.toFixed(3)}`
          )
          continue
        }
      }
    } else if (gold === 'adjacent' || gold === 'unrelated') {
      if (wouldMerge || uidA === uidB) {
        failures.push(
          `${gold}-pair collapsed: "${a}" vs "${b}" → ${adj.label}@${adj.confidence.toFixed(2)} cos=${cos.toFixed(3)} uidSame=${uidA === uidB}`
        )
        continue
      }
    }
    pairOk += 1
    console.log(`  ok ${gold}: ${adj.label}@${adj.confidence.toFixed(2)} cos=${cos.toFixed(3)}`)
  }

  // Proposition sample: gold thesis question should match retrieved registry text as same/adjacent.
  const props = parseCsv(fs.readFileSync(PROPS_PATH, 'utf8'))
    .filter(
      (r) =>
        (r.debate_role || '').trim() === 'thesis' &&
        (r.question || '').trim() &&
        (r.question || '').trim().toLowerCase() !== 'none'
    )
    .slice(0, 20)

  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'

  let attachOk = 0
  let attachChecked = 0
  if (uri && username && password && props.length) {
    const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      disableLosslessIntegers: true,
    })
    const session = driver.session({ database })
    try {
      const reg = await session.run(`
        MATCH (q:Question)
        WHERE q.embedding IS NOT NULL
        RETURN q.uid AS uid, q.question AS question, q.embedding AS embedding
      `)
      const registry = reg.records.map((r) => ({
        uid: String(r.get('uid')),
        question: String(r.get('question') ?? ''),
        embedding: (r.get('embedding') as number[]) ?? [],
      }))

      for (const row of props) {
        const goldQ = ensureQuestionMark(row.question.trim())
        const [emb] = await embedTexts(apiKey, [goldQ], EMBEDDING_MODEL)
        const ranked = registry
          .map((q) => ({
            ...q,
            score: cosineSimilarity(emb, q.embedding),
          }))
          .filter((q) => q.score > 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, TOP_K_QUESTIONS)

        attachChecked += 1
        if (!ranked.length) {
          failures.push(`prop sample: no registry hit for "${goldQ.slice(0, 80)}"`)
          continue
        }
        const top = ranked[0]
        const adj = await adjudicate(apiKey, goldQ, top.question)
        if (
          adj.label === 'same' ||
          normalizeQuestionText(goldQ) === normalizeQuestionText(top.question)
        ) {
          attachOk += 1
        } else {
          failures.push(
            `prop sample miss: gold "${goldQ.slice(0, 60)}" top "${top.question.slice(0, 60)}" → ${adj.label}`
          )
        }
      }
    } finally {
      await session.close()
      await driver.close()
    }
  } else {
    console.log('Skipping Neo prop attach sample (no NEO4J_* or no thesis rows)')
  }

  console.log(
    `\nPairs ok=${pairOk}/${pairs.length}; prop attach ok=${attachOk}/${attachChecked}`
  )
  if (failures.length) {
    console.error('\nFAILURES:')
    for (const f of failures) console.error(` - ${f}`)
    process.exit(1)
  }
  console.log('eval-question-gold: ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
