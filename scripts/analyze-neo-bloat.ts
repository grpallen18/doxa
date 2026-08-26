/** One-shot Neo4j bloat analysis (read-only). */
import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
  { disableLosslessIntegers: true }
)
const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })

async function rows(cypher: string, params: Record<string, unknown> = {}) {
  const r = await session.run(cypher, params)
  return r.records.map((rec) => {
    const o: Record<string, unknown> = {}
    for (const k of rec.keys) o[k as string] = rec.get(k)
    return o
  })
}

async function main() {
  const totals = (await rows(`
    MATCH (n) WITH count(n) AS nodes
    MATCH ()-[r]->() RETURN nodes, count(r) AS rels
  `))[0]

  const byLabel = await rows(`
    CALL db.labels() YIELD label
    CALL {
      WITH label
      MATCH (n) WHERE label IN labels(n)
      RETURN count(n) AS c
    }
    RETURN label, c ORDER BY c DESC
  `)

  const byRel = await rows(`
    CALL db.relationshipTypes() YIELD relationshipType
    CALL {
      WITH relationshipType
      MATCH ()-[r]->() WHERE type(r) = relationshipType
      RETURN count(r) AS c
    }
    RETURN relationshipType AS type, c ORDER BY c DESC
  `)

  const decisionsByType = await rows(`
    MATCH (d:Decision)
    RETURN coalesce(d.decisionType, '(null)') AS decisionType, count(d) AS c
    ORDER BY c DESC
  `)

  const legacy = await rows(`
    OPTIONAL MATCH (i:Issue) WHERE i.uid STARTS WITH 'arena:' WITH count(i) AS arenas
    OPTIONAL MATCH (i2:Issue) WHERE i2.uid STARTS WITH 'issue:' WITH arenas, count(i2) AS legacyIssues
    OPTIONAL MATCH (s:Story) WITH arenas, legacyIssues, count(s) AS stories
    OPTIONAL MATCH (a:Assertion) WITH arenas, legacyIssues, stories, count(a) AS assertions
    OPTIONAL MATCH (ch:Chunk) WITH arenas, legacyIssues, stories, assertions, count(ch) AS chunks
    OPTIONAL MATCH (q:Question) WHERE q.seededFromFixture = true
    WITH arenas, legacyIssues, stories, assertions, chunks, count(q) AS fixtureQuestions
    RETURN arenas, legacyIssues, stories, assertions, chunks, fixtureQuestions
  `)

  const docs = await rows(`
    MATCH (d:Document)
    OPTIONAL MATCH (d)-[:CONTAINS]->(:Segment)
    WITH d, count(*) AS segments
    OPTIONAL MATCH (u:Utterance {documentUid: d.uid})
    WITH d, segments, count(u) AS utterances
    RETURN count(d) AS documents,
           avg(segments) AS avgSegments,
           avg(utterances) AS avgUtterances,
           max(segments) AS maxSegments,
           max(utterances) AS maxUtterances
  `)

  const orphans = await rows(`
    OPTIONAL MATCH (a:Assessment)
    WHERE a.targetKind = 'controversy' AND NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
    WITH count(a) AS orphanAssessments
    OPTIONAL MATCH (d:Decision)
    WHERE d.decisionType STARTS WITH 'assess' AND NOT EXISTS { MATCH (d)-[:ABOUT]->() }
    WITH orphanAssessments, count(d) AS orphanAssessDecisions
    OPTIONAL MATCH (v:Viewpoint)
    WHERE v.questionUid IS NULL OR NOT EXISTS { MATCH (q:Question {uid: v.questionUid}) }
    WITH orphanAssessments, orphanAssessDecisions, count(v) AS orphanViewpoints
    OPTIONAL MATCH (i:Issue) WHERE NOT EXISTS { MATCH (i)<-[:IN_ISSUE]-() }
    RETURN orphanAssessments, orphanAssessDecisions, orphanViewpoints, count(i) AS emptyIssues
  `)

  const l3l4 = await rows(`
    OPTIONAL MATCH (q:Question) WITH count(q) AS questions
    OPTIONAL MATCH (c:Controversy) WITH questions, count(c) AS controversies
    OPTIONAL MATCH (v:Viewpoint) WITH questions, controversies, count(v) AS viewpoints
    OPTIONAL MATCH (disp:Dispute) WITH questions, controversies, viewpoints, count(disp) AS disputes
    OPTIONAL MATCH (arg:Argument) WITH questions, controversies, viewpoints, disputes, count(arg) AS arguments
    OPTIONAL MATCH (p:Proposition) WITH questions, controversies, viewpoints, disputes, arguments, count(p) AS propositions
    OPTIONAL MATCH (ec:EvidenceCheck) WITH questions, controversies, viewpoints, disputes, arguments, propositions, count(ec) AS evidenceChecks
    OPTIONAL MATCH (cit:Citation) WITH questions, controversies, viewpoints, disputes, arguments, propositions, evidenceChecks, count(cit) AS citations
    OPTIONAL MATCH (as:Assessment) WITH questions, controversies, viewpoints, disputes, arguments, propositions, evidenceChecks, citations, count(as) AS assessments
    OPTIONAL MATCH (mr:MethodRun) WITH questions, controversies, viewpoints, disputes, arguments, propositions, evidenceChecks, citations, assessments, count(mr) AS methodRuns
    RETURN questions, controversies, viewpoints, disputes, arguments, propositions, evidenceChecks, citations, assessments, methodRuns
  `)

  const pairCandidates = await rows(`
    MATCH (d:Decision {decisionType: 'proposition_pair_candidate'})
    RETURN count(d) AS pairCandidateDecisions
  `)

  const dangling = await rows(`
    OPTIONAL MATCH (a:Agent)
    WHERE NOT EXISTS { MATCH (:Utterance)-[:ASSERTED_BY]->(a) }
      AND NOT EXISTS { MATCH (:Utterance)-[:MENTIONS]->(a) }
    WITH count(a) AS agentsUnused
    OPTIONAL MATCH (p:Proposition)
    WHERE NOT EXISTS { MATCH (:Utterance)-[:EXPRESSES]->(p) }
    WITH agentsUnused, count(p) AS propsOrphan
    OPTIONAL MATCH (e:Entity)
    WHERE NOT EXISTS { MATCH (:Utterance)-[:MENTIONS]->(e) }
    WITH agentsUnused, propsOrphan, count(e) AS entitiesOrphan
    OPTIONAL MATCH (arg:Argument)
    WHERE NOT EXISTS { MATCH (arg)-[:HAS_ROLE]->() }
    RETURN agentsUnused, propsOrphan, entitiesOrphan, count(arg) AS argsNoRoles
  `)

  const topPubs = await rows(`
    MATCH (d:Document)-[:PUBLISHED_BY]->(p:Publication)
    RETURN coalesce(p.name, p.uid) AS pub, count(d) AS docs
    ORDER BY docs DESC LIMIT 12
  `)

  const layerShare = byLabel
    .filter((r) => Number(r.c) > 0)
    .map((r) => ({
      label: r.label,
      c: r.c,
      pct: Math.round((Number(r.c) / Number(totals.nodes)) * 1000) / 10,
    }))

  console.log(JSON.stringify({
    totals,
    layerShare,
    byRel,
    decisionsByType,
    legacy: legacy[0],
    docs: docs[0],
    orphans: orphans[0],
    dangling: dangling[0],
    l3l4: l3l4[0],
    pairCandidates: pairCandidates[0],
    topPubs,
  }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await session.close()
    await driver.close()
  })
