import { type Session } from 'neo4j-driver'
import { withNeo4jSession, getNeo4jConfig } from '@/lib/neo4j/server'

export type NeoPipelineCounts = {
  configured: boolean
  /** Set when Neo is configured but snapshot queries failed (never silent zeros). */
  error: string | null
  documents: number
  utterances: number
  propositions: number
  argumentCount: number
  agents: number
  questions: number
  questionsDeveloping: number
  questionsEstablished: number
  answersEdges: number
  answersDegree0: number
  answersDegree1: number
  answersDegree2Plus: number
  qualifyPoolMultiHq: number
  qualifyPoolOpposing: number
  controversiesTotal: number
  controversiesEstablished: number
  controversiesWithViewpoints: number
  controversiesZeroViewpoints: number
  decisionsQuarantinedMatch: number
  decisionsQuarantinedAnswer: number
  viewpoints: number
  disputes: number
  evidenceChecks: number
  citations: number
  assessments: number
  pendingEvidenceCheckCandidates: number
  graphNodes: number
  graphRels: number
  nodeCap: number
  relCap: number
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && value != null && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const AURA_FREE_NODE_CAP = 200_000
const AURA_FREE_REL_CAP = 400_000

const EMPTY: NeoPipelineCounts = {
  configured: false,
  error: null,
  documents: 0,
  utterances: 0,
  propositions: 0,
  argumentCount: 0,
  agents: 0,
  questions: 0,
  questionsDeveloping: 0,
  questionsEstablished: 0,
  answersEdges: 0,
  answersDegree0: 0,
  answersDegree1: 0,
  answersDegree2Plus: 0,
  qualifyPoolMultiHq: 0,
  qualifyPoolOpposing: 0,
  controversiesTotal: 0,
  controversiesEstablished: 0,
  controversiesWithViewpoints: 0,
  controversiesZeroViewpoints: 0,
  decisionsQuarantinedMatch: 0,
  decisionsQuarantinedAnswer: 0,
  viewpoints: 0,
  disputes: 0,
  evidenceChecks: 0,
  citations: 0,
  assessments: 0,
  pendingEvidenceCheckCandidates: 0,
  graphNodes: 0,
  graphRels: 0,
  nodeCap: AURA_FREE_NODE_CAP,
  relCap: AURA_FREE_REL_CAP,
}

async function runCount(session: Session, cypher: string): Promise<number> {
  const result = await session.run(cypher)
  return asCount(result.records[0]?.get('c'))
}

/** Snapshot counts for Observability funnel (L0–L4 Neo labels). */
export async function getNeoPipelineCounts(): Promise<NeoPipelineCounts> {
  if (!getNeo4jConfig()) {
    return { ...EMPTY, error: 'Neo4j env not configured (NEO4J_URI / USERNAME / PASSWORD)' }
  }

  try {
    return await withNeo4jSession(async (session) => {
      const documents = await runCount(session, 'MATCH (n:Document) RETURN count(n) AS c')
      const utterances = await runCount(session, 'MATCH (n:Utterance) RETURN count(n) AS c')
      const propositions = await runCount(session, 'MATCH (n:Proposition) RETURN count(n) AS c')
      const argumentCount = await runCount(session, 'MATCH (n:Argument) RETURN count(n) AS c')
      const agents = await runCount(session, 'MATCH (n:Agent) RETURN count(n) AS c')
      const questions = await runCount(session, 'MATCH (n:Question) RETURN count(n) AS c')
      const questionsDeveloping = await runCount(
        session,
        `MATCH (q:Question)
         WHERE coalesce(q.status, 'developing') = 'developing'
         RETURN count(q) AS c`
      )
      const questionsEstablished = await runCount(
        session,
        `MATCH (q:Question {status: 'established'}) RETURN count(q) AS c`
      )
      const answersEdges = await runCount(
        session,
        'MATCH ()-[a:ANSWERS]->(:Question) RETURN count(a) AS c'
      )
      const decisionsQuarantinedMatch = await runCount(
        session,
        `MATCH (d:Decision)
         WHERE d.status = 'quarantined' AND d.decisionType = 'question_match'
         RETURN count(d) AS c`
      )
      const decisionsQuarantinedAnswer = await runCount(
        session,
        `MATCH (d:Decision)
         WHERE d.status = 'quarantined' AND d.decisionType = 'question_answer'
         RETURN count(d) AS c`
      )
      const controversiesTotal = await runCount(session, 'MATCH (c:Controversy) RETURN count(c) AS c')
      const controversiesEstablished = await runCount(
        session,
        `MATCH (c:Controversy {status: 'established'}) RETURN count(c) AS c`
      )
      const viewpoints = await runCount(session, 'MATCH (v:Viewpoint) RETURN count(v) AS c')
      const disputes = await runCount(session, 'MATCH (d:Dispute) RETURN count(d) AS c')
      const evidenceChecks = await runCount(session, 'MATCH (ec:EvidenceCheck) RETURN count(ec) AS c')
      const citations = await runCount(session, 'MATCH (cit:Citation) RETURN count(cit) AS c')
      const assessments = await runCount(session, 'MATCH (ass:Assessment) RETURN count(ass) AS c')
      const pendingEvidenceCheckCandidates = await runCount(
        session,
        `MATCH (d:Decision)
         WHERE d.status = 'pending' AND d.decisionType = 'evidence_check_candidate'
         RETURN count(d) AS c`
      )
      const graphNodes = await runCount(session, 'MATCH (n) RETURN count(n) AS c')
      const graphRels = await runCount(session, 'MATCH ()-[r]->() RETURN count(r) AS c')

      const degree = await session.run(
        `
        MATCH (q:Question)
        OPTIONAL MATCH (:Proposition)-[a:ANSWERS]->(q)
        WITH q, count(a) AS ac
        RETURN
          sum(CASE WHEN ac = 0 THEN 1 ELSE 0 END) AS answersDegree0,
          sum(CASE WHEN ac = 1 THEN 1 ELSE 0 END) AS answersDegree1,
          sum(CASE WHEN ac >= 2 THEN 1 ELSE 0 END) AS answersDegree2Plus
        `
      )
      const degreeRec = degree.records[0]

      const pool = await session.run(
        `
        MATCH (q:Question)<-[a:ANSWERS]-(:Proposition)
        WHERE coalesce(a.confidence, 0) >= 0.7
          AND a.polarity IN ['FAVOR','AGAINST','AFFIRMS','DENIES']
        WITH q, collect(DISTINCT a.polarity) AS pols, count(a) AS ansN
        WHERE ansN >= 2
        WITH q, pols,
          (
            (any(x IN pols WHERE x = 'FAVOR') AND any(x IN pols WHERE x = 'AGAINST'))
            OR
            (any(x IN pols WHERE x = 'AFFIRMS') AND any(x IN pols WHERE x = 'DENIES'))
          ) AS opposing
        RETURN count(*) AS qualifyPoolMultiHq,
               sum(CASE WHEN opposing THEN 1 ELSE 0 END) AS qualifyPoolOpposing
        `
      )
      const poolRec = pool.records[0]

      const sides = await session.run(
        `
        MATCH (c:Controversy {status: 'established'})
        OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
        WITH c, count(DISTINCT v) AS sideN
        RETURN
          sum(CASE WHEN sideN >= 2 THEN 1 ELSE 0 END) AS controversiesWithViewpoints,
          sum(CASE WHEN sideN = 0 THEN 1 ELSE 0 END) AS controversiesZeroViewpoints
        `
      )
      const sidesRec = sides.records[0]

      return {
        configured: true,
        error: null,
        documents,
        utterances,
        propositions,
        argumentCount,
        agents,
        questions,
        questionsDeveloping,
        questionsEstablished,
        answersEdges,
        answersDegree0: asCount(degreeRec?.get('answersDegree0')),
        answersDegree1: asCount(degreeRec?.get('answersDegree1')),
        answersDegree2Plus: asCount(degreeRec?.get('answersDegree2Plus')),
        qualifyPoolMultiHq: asCount(poolRec?.get('qualifyPoolMultiHq')),
        qualifyPoolOpposing: asCount(poolRec?.get('qualifyPoolOpposing')),
        controversiesTotal,
        controversiesEstablished,
        controversiesWithViewpoints: asCount(
          sidesRec?.get('controversiesWithViewpoints')
        ),
        controversiesZeroViewpoints: asCount(
          sidesRec?.get('controversiesZeroViewpoints')
        ),
        decisionsQuarantinedMatch,
        decisionsQuarantinedAnswer,
        viewpoints,
        disputes,
        evidenceChecks,
        citations,
        assessments,
        pendingEvidenceCheckCandidates,
        graphNodes,
        graphRels,
        nodeCap: AURA_FREE_NODE_CAP,
        relCap: AURA_FREE_REL_CAP,
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[getNeoPipelineCounts]', message)
    return { ...EMPTY, configured: true, error: message }
  }
}
