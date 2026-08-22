/**
 * Seed dev fixtures: attach opposing theses to the same Question and qualify Controversy.
 * Usage: npx tsx scripts/seed-controversy-fixtures.ts
 *
 * Requires NEO4J_* in .env.local. Idempotent smoke fixtures only.
 */

import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { fileURLToPath } from 'url'
import {
  CONTROVERSY_SCHEMA_VERSION,
  controversyUidFromQuestion,
  evaluateQuestionControversy,
  ESTABLISH_MIN_CONFIDENCE,
} from '../doxa-agents/lib/debate/qualify-controversy.ts'
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
  polarity: 'FAVOR' | 'AGAINST' | 'AFFIRMS' | 'DENIES'
}

type Fixture = {
  question: string
  questionType: string
  exclusivity: string
  sides: FixtureSide[]
}

const MEASLES_FIXTURE: Fixture = {
  question: 'Should parents vaccinate their children against measles?',
  questionType: 'policy',
  exclusivity: 'exclusive',
  sides: [
    {
      propUid: 'prop:02a5b3365344d0f93b25',
      text: 'Parents should vaccinate their children against measles.',
      polarity: 'FAVOR',
    },
    {
      propUid: 'prop:00ae5f513e72c2fad2fa',
      text: 'The report is appalling and reflects cruelty at the center of the Trump immigration agenda.',
      polarity: 'AGAINST',
    },
  ],
}

const MULTI_AGAINST: Fixture = {
  question: 'Should the United States continue military aid to Ukraine?',
  questionType: 'policy',
  exclusivity: 'exclusive',
  sides: [
    {
      propUid: 'prop:07cb6683af2ea23ede34',
      text: 'France strongly condemns the Russian strikes that killed civilians in Ukraine and the violation of Polish airspace.',
      polarity: 'FAVOR',
    },
    {
      propUid: 'prop:056eeb7f19e88648e51e',
      text: "The ICC's ability to target American nationals and nationals of other non-member states must end.",
      polarity: 'AGAINST',
    },
    {
      propUid: 'prop:0649103a6e5fbe33640c',
      text: "Ending CBP's use of the facility would harm many people on both sides of the border.",
      polarity: 'AGAINST',
    },
    {
      propUid: 'prop:0907e9ec9dd62aa7696e',
      text: "The Trump administration's case against Davey Hearn should never have been brought.",
      polarity: 'AGAINST',
    },
  ],
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
    let qualified = 0
    for (const fx of [MEASLES_FIXTURE, MULTI_AGAINST]) {
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
              a.polarity = $polarity,
              a.confidence = $confidence,
              a.decisionUid = $decisionUid,
              a.updatedAt = datetime()
          MERGE (dec:Decision {uid: $decisionUid})
          SET dec.decisionType = 'question_answer',
              dec.status = 'accepted',
              dec.actor = 'fixture',
              dec.confidence = $confidence,
              dec.relevant = true,
              dec.polarity = $polarity,
              dec.createdAt = coalesce(dec.createdAt, datetime()),
              dec.updatedAt = datetime()
          MERGE (dec)-[:ABOUT]->(p)
          MERGE (dec)-[:ABOUT]->(q)
          `,
          {
            propUid: side.propUid,
            text: side.text,
            uid,
            polarity: side.polarity,
            confidence: ESTABLISH_MIN_CONFIDENCE + 0.05,
            decisionUid,
          }
        )
      }

      const assignments = fx.sides.map((s) => ({
        propUid: s.propUid,
        polarity: s.polarity,
        confidence: ESTABLISH_MIN_CONFIDENCE + 0.05,
        debateRole: 'thesis' as const,
      }))
      const uniqueAssignments = [...new Map(assignments.map((a) => [a.propUid, a])).values()]

      const result = evaluateQuestionControversy({
        questionUid: uid,
        questionType: fx.questionType,
        answerExclusivity: fx.exclusivity,
        assignments: uniqueAssignments,
      })

      const ctrUid = controversyUidFromQuestion(uid)
      const decisionUid = `cqual:${uid}`.slice(0, 180)

      if (result.qualifies) {
        await session.run(
          `
          MATCH (q:Question {uid: $uid})
          MERGE (c:Controversy {uid: $ctrUid})
          ON CREATE SET c.createdAt = datetime()
          SET c.question = $question,
              c.questionUid = $uid,
              c.status = 'established',
              c.confidence = $confidence,
              c.qualifyReason = $reason,
              c.schemaVersion = $schemaVersion,
              c.summary = $summary,
              c.updatedAt = datetime()
          MERGE (c)-[:ABOUT]->(q)
          SET q.status = 'established', q.updatedAt = datetime()
          MERGE (dec:Decision {uid: $decisionUid})
          SET dec.decisionType = 'controversy_qualify',
              dec.status = 'accepted',
              dec.actor = 'fixture',
              dec.confidence = $confidence,
              dec.reason = $reason,
              dec.createdAt = coalesce(dec.createdAt, datetime()),
              dec.updatedAt = datetime()
          MERGE (dec)-[:ABOUT]->(q)
          MERGE (dec)-[:ABOUT]->(c)
          `,
          {
            uid,
            ctrUid,
            question: qText,
            confidence: result.confidence,
            reason: result.reason,
            schemaVersion: CONTROVERSY_SCHEMA_VERSION,
            summary: `Contested: ${qText}`,
            decisionUid,
          }
        )
        qualified += 1
        console.log(`qualified: ${normalizeQuestionText(qText).slice(0, 50)} → ${ctrUid}`)
      } else {
        console.log(`skipped (no qualify): ${qText.slice(0, 50)} → ${result.reason}`)
      }
    }

    const count = await session.run(`
      MATCH (c:Controversy {status: 'established'}) RETURN count(c) AS n
    `)
    console.log(`Done. fixtures_qualified=${qualified} established_total=${count.records[0]?.get('n')}`)
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
