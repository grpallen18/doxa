/**
 * Post-ship L3 controversy path verification (fail-closed).
 * Usage: npm run verify:l3
 *
 * 1) Gold evals (question / controversy / viewpoint)
 * 2) Seed synthetic on-topic fixture theses + ANSWERS (no gold prop reassignment)
 * 3) Assert thesis↔question embedding relevance before pipeline
 * 4) Invoke qualify → viewpoints → project
 * 5) Assert Neo + Postgres publish gates + projected viewpoint relevance
 */

import { config as loadDotenv } from 'dotenv'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver, type Session } from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import {
  EMBEDDING_MODEL,
  QUESTION_SCHEMA_VERSION,
  cosineSimilarity,
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
/** Floor for thesis↔question cosine (text-embedding-3-small). Off-topic gold noise sits ~0.05–0.2. */
const MIN_THESIS_QUESTION_COSINE = 0.32
const POISONED_QUESTION_UID = 'cq:fbbbcdccf2679df8cd67'
const LEGACY_POISON_PROP_UIDS = [
  'prop:00123db1c47b8fb9ecfd',
  'prop:0028a06e4268a06a1a7e',
  'prop:0065e5772c4a8c3b7ff0',
  'prop:00ae5f513e72c2fad2fa',
  'prop:0164ac2dad01f83fb0dd',
  'prop:038ff36cf12c0ce1a4e6',
]

type FixtureThesis = { uid: string; text: string }

type Fixture = {
  id: string
  question: string
  question_type: string
  exclusivity: string
  pro_polarity: string
  con_polarity: string
  pro_theses: FixtureThesis[]
  con_theses: FixtureThesis[]
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

function fixtureTheses(fixture: Fixture): Array<FixtureThesis & { polarity: string }> {
  const pro = fixture.pro_theses ?? []
  const con = fixture.con_theses ?? []
  if (pro.length < 2 || con.length < 2) {
    throw new Error(
      `Fixture ${fixture.id} needs ≥2 pro_theses and ≥2 con_theses (got ${pro.length}/${con.length})`
    )
  }
  for (const t of [...pro, ...con]) {
    if (!t?.uid?.startsWith('prop:verify:')) {
      throw new Error(
        `Fixture ${fixture.id} thesis uid must be prop:verify:* (got ${t?.uid}) — do not reassign gold props`
      )
    }
    if (!t.text?.trim() || t.text.trim().length < 24) {
      throw new Error(`Fixture ${fixture.id} thesis ${t.uid} missing usable text`)
    }
  }
  return [
    ...pro.map((t) => ({ ...t, polarity: fixture.pro_polarity })),
    ...con.map((t) => ({ ...t, polarity: fixture.con_polarity })),
  ]
}

async function assertThesesRelevantToQuestion(
  apiKey: string,
  question: string,
  theses: FixtureThesis[],
  label: string
): Promise<void> {
  const texts = [question, ...theses.map((t) => t.text)]
  const embeddings = await embedTexts(apiKey, texts, EMBEDDING_MODEL)
  const qEmb = embeddings[0] ?? []
  const failures: string[] = []
  for (let i = 0; i < theses.length; i++) {
    const cos = cosineSimilarity(qEmb, embeddings[i + 1] ?? [])
    if (cos < MIN_THESIS_QUESTION_COSINE) {
      failures.push(
        `${theses[i].uid} cos=${cos.toFixed(3)} < ${MIN_THESIS_QUESTION_COSINE} text=${theses[i].text.slice(0, 80)}`
      )
    }
  }
  if (failures.length) {
    throw new Error(`${label} semantic relevance failed:\n - ${failures.join('\n - ')}`)
  }
}

async function cleanupPoisonedVerifyState(session: Session): Promise<void> {
  // Detach legacy gold props wrongly forced onto the immigration CQ.
  await session.run(
    `
    UNWIND $propUids AS propUid
    MATCH (p:Proposition {uid: propUid})-[a:ANSWERS]->(q:Question {uid: $questionUid})
    DELETE a
    `,
    { propUids: LEGACY_POISON_PROP_UIDS, questionUid: POISONED_QUESTION_UID }
  )
  await session.run(
    `
    MATCH (dec:Decision)
    WHERE dec.actor = 'verify_l3'
       OR dec.uid STARTS WITH 'qverify:'
    OPTIONAL MATCH (dec)-[r]-()
    DELETE r, dec
    `
  )
  await session.run(
    `
    MATCH (c:Controversy)-[:ABOUT]->(q:Question {uid: $questionUid})
    OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
    OPTIONAL MATCH (v)-[vr]-()
    OPTIONAL MATCH (c)-[cr]-()
    DELETE vr, v, cr, c
    `,
    { questionUid: POISONED_QUESTION_UID }
  )
  // Orphan viewpoints left with this questionUid.
  await session.run(
    `
    MATCH (v:Viewpoint {questionUid: $questionUid})
    OPTIONAL MATCH (v)-[r]-()
    DELETE r, v
    `,
    { questionUid: POISONED_QUESTION_UID }
  )
  // Prior verify fixture graph (props/utterances/docs) — safe to wipe; reseed next.
  await session.run(
    `
    MATCH (u:Utterance)
    WHERE u.verifyFixture = true OR u.uid STARTS WITH 'utt:verify:'
    OPTIONAL MATCH (u)-[r]-()
    DELETE r, u
    `
  )
  await session.run(
    `
    MATCH (p:Proposition)
    WHERE p.verifyFixture = true OR p.uid STARTS WITH 'prop:verify:'
    OPTIONAL MATCH (p)-[r]-()
    DELETE r, p
    `
  )
  await session.run(
    `
    MATCH (d:Document)
    WHERE d.verifyFixture = true OR d.uid STARTS WITH 'doc:verify:'
    OPTIONAL MATCH (d)-[r]-()
    DELETE r, d
    `
  )
}

async function cleanupPostgresProjections(ctrUid: string): Promise<void> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || ''
  if (!supabaseUrl || !serviceKey) return
  const sb = createClient(supabaseUrl, serviceKey)
  await sb.from('graph_controversy_evidence').delete().eq('controversy_uid', ctrUid)
  await sb.from('graph_viewpoints').delete().eq('controversy_uid', ctrUid)
  await sb.from('graph_controversies').delete().eq('uid', ctrUid)
}

async function seedFixture(
  session: Session,
  apiKey: string,
  fixture: Fixture
): Promise<string> {
  const question = ensureQuestionMark(fixture.question)
  const uid = await questionUidFromText(question)
  const attachments = fixtureTheses(fixture)
  await assertThesesRelevantToQuestion(
    apiKey,
    question,
    attachments,
    `fixture ${fixture.id}`
  )

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

  // Clear prior verify attachments/viewpoints for this CQ only (idempotent re-runs).
  await session.run(
    `
    MATCH (p:Proposition)-[a:ANSWERS]->(q:Question {uid: $questionUid})
    WHERE p.uid STARTS WITH 'prop:verify:'
    DELETE a
    `,
    { questionUid: uid }
  )
  await session.run(
    `
    MATCH (c:Controversy)-[:ABOUT]->(q:Question {uid: $questionUid})
    OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
    OPTIONAL MATCH (v)-[vr]-()
    OPTIONAL MATCH (c)-[cr]-()
    DELETE vr, v, cr, c
    `,
    { questionUid: uid }
  )
  await session.run(
    `
    MATCH (v:Viewpoint {questionUid: $questionUid})
    OPTIONAL MATCH (v)-[r]-()
    DELETE r, v
    `,
    { questionUid: uid }
  )

  const documentUid = `doc:verify:${fixture.id}`
  await session.run(
    `
    MERGE (d:Document {uid: $documentUid})
    ON CREATE SET d.createdAt = datetime()
    SET d.title = $title,
        d.verifyFixture = true,
        d.publishedAt = coalesce(d.publishedAt, datetime()),
        d.updatedAt = datetime()
    `,
    {
      documentUid,
      title: `L3 verify fixture: ${fixture.id}`,
    }
  )

  for (const row of attachments) {
    const decisionUid = `qverify:${fixture.id}:${row.uid}`.slice(0, 180)
    const utteranceUid = `utt:verify:${fixture.id}:${row.uid}`.slice(0, 180)
    await session.run(
      `
      MERGE (p:Proposition {uid: $propUid})
      ON CREATE SET p.createdAt = datetime()
      SET p.text = $text,
          p.schemaVersion = coalesce(p.schemaVersion, 'verify-fixture'),
          p.updatedAt = datetime(),
          p.verifyFixture = true
      WITH p
      MATCH (q:Question {uid: $questionUid})
      MATCH (d:Document {uid: $documentUid})
      MERGE (u:Utterance {uid: $utteranceUid})
      ON CREATE SET u.createdAt = datetime()
      SET u.text = $text,
          u.documentUid = $documentUid,
          u.verifyFixture = true,
          u.updatedAt = datetime()
      MERGE (u)-[:EXPRESSES]->(p)
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
        propUid: row.uid,
        text: row.text,
        questionUid: uid,
        documentUid,
        utteranceUid,
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
  if (!fixtures?.length) throw new Error(`No fixtures in ${FIXTURES_PATH}`)

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
      console.log('=== cleanup poisoned verify attachments ===')
      await cleanupPoisonedVerifyState(session)
      const poisonCtr = controversyUidFromQuestion(POISONED_QUESTION_UID)
      await cleanupPostgresProjections(poisonCtr)

      console.log('=== seed fixtures + force debate steps ===')
      const primary = fixtures[0]
      seededQuestionUid = await seedFixture(session, apiKey, primary)
      console.log(`seeded ${primary.id} → ${seededQuestionUid}`)

      await cleanupPostgresProjections(controversyUidFromQuestion(seededQuestionUid))

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
          .select('uid,status,publish_block_reason,sides_count,source_count,question')
          .eq('uid', ctr)
          .maybeSingle()
        if (error) failures.push(`PG lookup failed: ${error.message}`)
        else if (!data || data.status !== 'open') {
          failures.push(`PG controversy not open: ${JSON.stringify(data)}`)
        } else {
          console.log('PG controversy open', data)
          const { data: vps, error: vpErr } = await sb
            .from('graph_viewpoints')
            .select('uid,thesis,summary,label')
            .eq('controversy_uid', ctr)
          if (vpErr) failures.push(`PG viewpoints lookup failed: ${vpErr.message}`)
          else {
            const qText = String(data.question || primary.question)
            const thesisRows = (vps ?? [])
              .map((v) => ({
                uid: String(v.uid),
                text: String(v.thesis || v.summary || v.label || '').trim(),
              }))
              .filter((v) => v.text.length >= 12)
            if (thesisRows.length < 2) {
              failures.push(`PG viewpoints missing theses: ${JSON.stringify(vps)}`)
            } else {
              try {
                await assertThesesRelevantToQuestion(
                  apiKey,
                  qText,
                  thesisRows.map((t) => ({ uid: t.uid, text: t.text })),
                  `projected viewpoints for ${ctr}`
                )
                console.log(
                  `PG viewpoint relevance OK (${thesisRows.length} theses ≥ ${MIN_THESIS_QUESTION_COSINE})`
                )
              } catch (e) {
                failures.push(String(e))
              }
            }
          }
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
