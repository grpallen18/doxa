/**
 * Seed dev fixtures: definitional Question + multi-thesis for Dispute detection.
 * Usage: npx tsx scripts/seed-dispute-fixtures.ts
 */

import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { fileURLToPath } from 'url'
import { ESTABLISH_MIN_CONFIDENCE } from '../doxa-agents/lib/debate/qualify-controversy.ts'
import {
  ensureQuestionMark,
  normalizeQuestionText,
  questionUidFromText,
  QUESTION_SCHEMA_VERSION,
} from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

type FixtureSide = {
  propUid: string
  text: string
}

const DEFINITIONAL_FIXTURE = {
  question: 'Are Democrats being labeled as Communists?',
  questionType: 'definitional',
  exclusivity: 'unknown',
  sides: [
    {
      propUid: 'prop:05c4eadddfe0216baed3',
      text: 'He is saying that Democrats are Communists.',
    },
    {
      propUid: 'prop:072abefb9a86efb31764',
      text: 'The AfD contradicts central fundamental values.',
    },
  ] as FixtureSide[],
}

async function main() {
  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'
  if (!uri || !username || !password) {
    throw new Error('Missing NEO4J_* in .env.local')
  }

  const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database })

  try {
    const fx = DEFINITIONAL_FIXTURE
    const qText = ensureQuestionMark(fx.question)
    const uid = await questionUidFromText(qText)

    await session.run(
      `
      MERGE (q:Question {uid: $uid})
      ON CREATE SET q.createdAt = datetime(), q.status = 'developing', q.confidence = 1.0
      SET q.question = $question,
          q.questionType = $questionType,
          q.answerExclusivity = $exclusivity,
          q.schemaVersion = $schemaVersion,
          q.seededFromFixture = true,
          q.updatedAt = datetime()
      `,
      {
        uid,
        question: qText,
        questionType: fx.questionType,
        exclusivity: fx.exclusivity,
        schemaVersion: QUESTION_SCHEMA_VERSION,
      }
    )

    for (const side of fx.sides) {
      const decisionUid = `fixans:${side.propUid}:${uid}`.slice(0, 180)
      await session.run(
        `
        MERGE (p:Proposition {uid: $propUid})
        ON CREATE SET p.createdAt = datetime()
        SET p.text = coalesce(p.text, $text),
            p.normalizedText = coalesce(p.normalizedText, $text),
            p.updatedAt = datetime()
        WITH p
        MATCH (q:Question {uid: $uid})
        OPTIONAL MATCH (p)-[old:ANSWERS]->(:Question)
        DELETE old
        MERGE (p)-[a:ANSWERS]->(q)
        SET a.debateRole = 'thesis',
            a.polarity = 'NONE',
            a.confidence = $confidence,
            a.decisionUid = $decisionUid,
            a.updatedAt = datetime()
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_answer',
            dec.status = 'accepted',
            dec.actor = 'fixture',
            dec.confidence = $confidence,
            dec.relevant = true,
            dec.polarity = 'NONE',
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          propUid: side.propUid,
          text: side.text,
          uid,
          confidence: ESTABLISH_MIN_CONFIDENCE + 0.05,
          decisionUid,
        }
      )
    }

    console.log(`seeded definitional Question: ${normalizeQuestionText(qText).slice(0, 50)} → ${uid}`)

    const count = await session.run(
      `
      MATCH (q:Question {questionType: 'definitional'})<-[a:ANSWERS]-(p:Proposition)
      WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
        AND coalesce(a.confidence, 0) >= $minConf
      WITH q, count(DISTINCT p) AS n
      WHERE n >= 2
      RETURN count(q) AS questions
      `,
      { minConf: ESTABLISH_MIN_CONFIDENCE }
    )
    console.log(`Done. definitional_multi_thesis_questions=${count.records[0]?.get('questions')}`)
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
