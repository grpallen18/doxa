/**
 * Post-ship L3 controversy path verification (fail-closed).
 * Usage: npm run verify:l3
 *
 * 1) Gold evals (question / controversy / viewpoint)
 * 2) Seed fixture Questions + force ANSWERS attachments
 * 3) Invoke qualify → viewpoints → project (or debate_pipeline steps)
 * 4) Assert Neo + Postgres publish gates
 */

import { config as loadDotenv } from 'dotenv'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import {
  EMBEDDING_MODEL,
  QUESTION_SCHEMA_VERSION,
  embedTexts,
  ensureQuestionMark,
  questionUidFromText,
} from '../doxa-agents/lib/debate/question-identity.ts'
import { controversyUidFromQuestion } from '../doxa-agents/lib/debate/qualify-controversy.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

const FIXTURES_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'l3-verify-fixtures.json')
const AURA_FREE_NODE_CAP = 200_000

type Fixture = {
  id: string
  question: string
  question_type: string
  exclusivity: string
  pro_prop_uids: string[]
  con_prop_uids: string[]
  pro_polarity: string
  con_polarity: string
}

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber()
  }
  return Number(v) || 0
}

function runGoldEval(script: string) {
  const r = spawnSync('npx', ['tsx', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
    env: process.env,
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0) {
    throw new Error(`${script} failed with exit ${r.status}`)
  }
}

async function invokeEdge(
  name: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
    /\/$/,
    ''
  )
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || ''
  if (!base || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`${name} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`)
  }
  return data
}

async function seedFixture(
  session: neo4j.Session,
  apiKey: string,
  fixture: Fixture
): Promise<string> {
  const question = ensureQuestionMark(fixture.question)
  const uid = await questionUidFromText(question)
  const [embedding] = await embedTexts(apiKey, [question], EMBEDDING_MODEL)
  await session.run(
    `
    MERGE (q:Question {uid: $uid})
    ON CREATE SET q.createdAt = datetime(), q.status = 'developing'
    SET q.question = $question,
        q.questionType = $questionType,
        q.answerExclusivity = $exclusivity,
        q.embedding = $embedding,
        q.schemaVersion = $schemaVersion,
        q.updatedAt = datetime()
    `,
    {
      uid,
      question,
      questionType: fixture.question_type,
      exclusivity: fixture.exclusivity,
      embedding: embedding ?? [],
      schemaVersion: QUESTION_SCHEMA_VERSION,
    }
  )

  const attachments: Array<{ propUid: string; polarity: string }> = [
    ...fixture.pro_prop_uids.map((propUid) => ({
      propUid,
      polarity: fixture.pro_polarity,
    })),
    ...fixture.con_prop_uids.map((propUid) => ({
      propUid,
      polarity: fixture.con_polarity,
    })),
  ]

  for (const row of attachments) {
    const decisionUid = `qverify:${fixture.id}:${row.propUid}`.slice(0, 180)
    await session.run(
      `
      MATCH (p:Proposition {uid: $propUid})
      MATCH (q:Question {uid: $questionUid})
      OPTIONAL MATCH (p)-[old:ANSWERS]->(:Question)
      DELETE old
      MERGE (dec:Decision {uid: $decisionUid})
      SET dec.decisionType = 'question_link',
          dec.status = 'accepted',
          dec.actor = 'verify_l3',
          dec.confidence = 0.9,
          dec.label = 'fixture_attach',
          dec.createdAt = coalesce(dec.createdAt, datetime()),
          dec.updatedAt = datetime()
      MERGE (dec)-[:ABOUT]->(p)
      MERGE (dec)-[:ABOUT]->(q)
      MERGE (p)-[a:ANSWERS]->(q)
      SET a.debateRole = 'thesis',
          a.polarity = $polarity,
          a.confidence = 0.9,
          a.decisionUid = $decisionUid,
          a.updatedAt = datetime()
      `,
      {
        propUid: row.propUid,
        questionUid: uid,
        decisionUid,
        polarity: row.polarity,
      }
    )
  }
  return uid
}

async function main() {
  const failures: string[] = []
  console.log('=== verify:l3 gold evals ===')
  for (const script of [
    'scripts/eval-question-gold.ts',
    'scripts/eval-controversy-gold.ts',
    'scripts/eval-viewpoint-gold.ts',
  ]) {
    try {
      runGoldEval(script)
    } catch (e) {
      failures.push(String(e))
    }
  }

  const uri = process.env.NEO4J_URI
  const user = process.env.NEO4J_USERNAME
  const password = process.env.NEO4J_PASSWORD
  const database = process.env.NEO4J_DATABASE || 'neo4j'
  const apiKey = process.env.OPENAI_API_KEY
  if (!uri || !user || !password || !apiKey) {
    throw new Error('Missing NEO4J_* or OPENAI_API_KEY')
  }

  const fixtures = (
    JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as { fixtures: Fixture[] }
  ).fixtures

  const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database })
  let seededQuestionUid = ''
  try {
    const nodes = n(
      (await session.run(`OPTIONAL MATCH (n) RETURN count(n) AS c`)).records[0]?.get('c')
    )
    console.log(`=== preflight nodes=${nodes} cap=${AURA_FREE_NODE_CAP} ===`)
    if (nodes >= AURA_FREE_NODE_CAP) {
      failures.push(
        `Aura at node cap (${nodes}). Run prune-oldest-documents --commit before verify writes.`
      )
    } else {
      console.log('=== seed fixtures + force debate steps ===')
      const primary = fixtures[0]
      seededQuestionUid = await seedFixture(session, apiKey, primary)
      console.log(`seeded ${primary.id} → ${seededQuestionUid}`)

      // qualify → viewpoints → project (mint/assign already forced via seed)
      await invokeEdge('qualify_controversies', {
        question_uid: seededQuestionUid,
        force: true,
        limit: 10,
      })
      await invokeEdge('build_viewpoints', {
        question_uid: seededQuestionUid,
        force: true,
        limit: 20,
      })
      const ctrUid = controversyUidFromQuestion(seededQuestionUid)
      await invokeEdge('project_debate_summaries', {
        question_uid: seededQuestionUid,
        controversy_uid: ctrUid,
        force: true,
        limit: 10,
      })

      const degree = await session.run(
        `
        MATCH (q:Question {uid: $uid})<-[a:ANSWERS]-(:Proposition)
        WHERE coalesce(a.confidence,0) >= 0.7
          AND a.polarity IN ['FAVOR','AGAINST','AFFIRMS','DENIES']
        WITH q, collect(DISTINCT a.polarity) AS pols, count(a) AS n
        RETURN n AS answers, pols,
          (
            (any(x IN pols WHERE x='FAVOR') AND any(x IN pols WHERE x='AGAINST'))
            OR
            (any(x IN pols WHERE x='AFFIRMS') AND any(x IN pols WHERE x='DENIES'))
          ) AS opposing
        `,
        { uid: seededQuestionUid }
      )
      const d = degree.records[0]
      if (!d || n(d.get('answers')) < 2 || !d.get('opposing')) {
        failures.push(
          `Fixture ${seededQuestionUid} missing multi-sided HQ ANSWERS (got ${JSON.stringify(d?.toObject())})`
        )
      }

      const sides = await session.run(
        `
        MATCH (c:Controversy)-[:ABOUT]->(q:Question {uid: $uid})
        OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
        RETURN c.uid AS ctr, c.status AS status, count(DISTINCT v) AS sides
        `,
        { uid: seededQuestionUid }
      )
      const s = sides.records[0]
      if (!s || s.get('status') !== 'established' || n(s.get('sides')) < 2) {
        failures.push(
          `Fixture controversy not publish-ready in Neo: ${JSON.stringify(s?.toObject())}`
        )
      } else {
        console.log('Neo controversy OK', s.toObject())
      }

      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || ''
      if (supabaseUrl && serviceKey && s) {
        const sb = createClient(supabaseUrl, serviceKey)
        const ctr = String(s.get('ctr') ?? '')
        const { data, error } = await sb
          .from('graph_controversies')
          .select('uid,status,publish_block_reason,sides_count,source_count')
          .eq('uid', ctr)
          .maybeSingle()
        if (error) failures.push(`PG lookup failed: ${error.message}`)
        else if (!data || data.status !== 'open') {
          failures.push(
            `PG controversy not open: ${JSON.stringify(data)}`
          )
        } else {
          console.log('PG controversy open', data)
        }
      }
    }

    const funnel = await session.run(
      `
      MATCH (q:Question)
      OPTIONAL MATCH (:Proposition)-[a:ANSWERS]->(q)
      WITH q, count(a) AS ac
      RETURN
        sum(CASE WHEN ac=0 THEN 1 ELSE 0 END) AS q0,
        sum(CASE WHEN ac=1 THEN 1 ELSE 0 END) AS q1,
        sum(CASE WHEN ac>=2 THEN 1 ELSE 0 END) AS q2plus
      `
    )
    console.log('funnel snapshot', funnel.records[0]?.toObject())
  } finally {
    await session.close()
    await driver.close()
  }

  if (failures.length) {
    console.error('\nverify:l3 FAILED')
    for (const f of failures) console.error(' -', f)
    process.exit(1)
  }
  console.log('\nverify:l3: ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
