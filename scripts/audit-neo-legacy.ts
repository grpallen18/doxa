/** Audit Neo4j for stale/legacy L3 and orphan patterns post-overhaul. */
import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

type Row = Record<string, unknown>

async function run(session: neo4j.Session, name: string, cypher: string): Promise<Row[]> {
  const r = await session.run(cypher)
  return r.records.map((rec) => {
    const o: Row = { _check: name }
    for (const k of rec.keys) o[k as string] = rec.get(k)
    return o
  })
}

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
    { disableLosslessIntegers: true }
  )
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })

  const checks = [
    ['labels', `CALL db.labels() YIELD label RETURN label ORDER BY label`],
    ['rel_types', `CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType`],
    ['node_counts', `
      OPTIONAL MATCH (q:Question) WITH count(q) AS questions
      OPTIONAL MATCH (c:Controversy) WITH questions, count(c) AS controversies
      OPTIONAL MATCH (v:Viewpoint) WITH questions, controversies, count(v) AS viewpoints
      OPTIONAL MATCH (d:Dispute) WITH questions, controversies, viewpoints, count(d) AS disputes
      OPTIONAL MATCH (i:Issue) WITH questions, controversies, viewpoints, disputes, count(i) AS issues
      OPTIONAL MATCH (p:Proposition) WITH questions, controversies, viewpoints, disputes, issues, count(p) AS propositions
      OPTIONAL MATCH (u:Utterance) WITH questions, controversies, viewpoints, disputes, issues, propositions, count(u) AS utterances
      RETURN questions, controversies, viewpoints, disputes, issues, propositions, utterances
    `],
    ['arena_issues', `MATCH (i:Issue) WHERE i.uid STARTS WITH 'arena:' RETURN count(i) AS n`],
    ['legacy_issues', `MATCH (i:Issue) WHERE i.uid STARTS WITH 'issue:' RETURN count(i) AS n`],
    ['relates_to', `MATCH ()-[r:RELATES_TO]->() RETURN count(r) AS n`],
    ['in_issue', `MATCH ()-[r:IN_ISSUE]->() RETURN count(r) AS n`],
    ['controversy_without_about', `
      MATCH (c:Controversy)
      WHERE NOT EXISTS { MATCH (c)-[:ABOUT]->(:Question) }
      RETURN count(c) AS n
    `],
    ['controversy_with_issueUid', `
      MATCH (c:Controversy) WHERE c.issueUid IS NOT NULL RETURN count(c) AS n
    `],
    ['viewpoint_without_questionUid', `
      MATCH (v:Viewpoint) WHERE v.questionUid IS NULL RETURN count(v) AS n
    `],
    ['dispute_without_surfaces_in', `
      MATCH (d:Dispute)
      WHERE NOT EXISTS { MATCH (d)-[:SURFACES_IN]->(:Question) }
      RETURN count(d) AS n
    `],
    ['dispute_old_controversy_link', `
      MATCH (d:Dispute)-[:SURFACES_IN]->(:Controversy) RETURN count(d) AS n
    `],
    ['fixture_questions', `MATCH (q:Question) WHERE q.seededFromFixture = true RETURN count(q) AS n`],
    ['questions_developing', `MATCH (q:Question) WHERE coalesce(q.status,'') = 'developing' RETURN count(q) AS n`],
    ['questions_established', `MATCH (q:Question) WHERE q.status = 'established' RETURN count(q) AS n`],
    ['answers_edges', `MATCH ()-[a:ANSWERS]->() RETURN count(a) AS n`],
    ['answers_fixture_actor', `
      MATCH ()-[a:ANSWERS]->()
      WHERE EXISTS {
        MATCH (dec:Decision {uid: a.decisionUid})
        WHERE dec.actor = 'fixture'
      }
      RETURN count(a) AS n
    `],
    ['pair_candidate_decisions', `
      MATCH (d:Decision {decisionType: 'proposition_pair_candidate'}) RETURN count(d) AS n
    `],
    ['controversy_title_decisions', `
      MATCH (d:Decision {decisionType: 'controversy_title'}) RETURN count(d) AS n
    `],
    ['orphan_controversy_assessments', `
      MATCH (a:Assessment {targetKind: 'controversy'})
      WHERE NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
      RETURN count(a) AS n
    `],
    ['legacy_story_nodes', `
      MATCH (n) WHERE n:Story OR n:Assertion OR n:Chunk RETURN labels(n)[0] AS label, count(*) AS n
    `],
  ]

  try {
    for (const [name, cypher] of checks) {
      const rows = await run(session, name, cypher)
      console.log(`\n## ${name}`)
      console.log(JSON.stringify(rows, null, 2))
    }
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
