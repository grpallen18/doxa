/** Supplemental Neo4j counts for cleanup audit. */
import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
    { disableLosslessIntegers: true }
  )
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })
  try {
    const r = await session.run(`
      OPTIONAL MATCH (s:Story) WITH count(s) AS stories
      OPTIONAL MATCH (a:Assertion) WITH stories, count(a) AS assertions
      OPTIONAL MATCH (c:Chunk) WITH stories, assertions, count(c) AS chunks
      OPTIONAL MATCH (src:Source) WITH stories, assertions, chunks, count(src) AS sources
      OPTIONAL MATCH (act:Actor) WITH stories, assertions, chunks, sources, count(act) AS actors
      OPTIONAL MATCH (ec:EvidenceCheck) WITH stories, assertions, chunks, sources, actors, count(ec) AS evidenceChecks
      OPTIONAL MATCH (cit:Citation) WITH stories, assertions, chunks, sources, actors, evidenceChecks, count(cit) AS citations
      OPTIONAL MATCH (ass:Assessment) WITH stories, assertions, chunks, sources, actors, evidenceChecks, citations, count(ass) AS assessments
      OPTIONAL MATCH (m:MethodRun) WITH stories, assertions, chunks, sources, actors, evidenceChecks, citations, assessments, count(m) AS methodRuns
      OPTIONAL MATCH (dec:Decision) WITH stories, assertions, chunks, sources, actors, evidenceChecks, citations, assessments, methodRuns, count(dec) AS decisions
      OPTIONAL MATCH ()-[ans:ANSWERS]->(:Question) WITH stories, assertions, chunks, sources, actors, evidenceChecks, citations, assessments, methodRuns, decisions, count(ans) AS answers
      OPTIONAL MATCH (q:Question) WHERE q.embedding IS NULL WITH stories, assertions, chunks, sources, actors, evidenceChecks, citations, assessments, methodRuns, decisions, answers, count(q) AS questionsNoEmbed
      RETURN stories, assertions, chunks, sources, actors, evidenceChecks, citations, assessments, methodRuns, decisions, answers, questionsNoEmbed
    `)
    console.log(JSON.stringify(r.records[0]?.toObject(), null, 2))

    const types = await session.run(`
      MATCH (d:Decision)
      RETURN d.decisionType AS type, count(*) AS n
      ORDER BY n DESC
      LIMIT 25
    `)
    console.log('\nDecision types:')
    console.log(JSON.stringify(types.records.map((x) => x.toObject()), null, 2))
  } finally {
    await session.close()
    await driver.close()
  }
}

main()
