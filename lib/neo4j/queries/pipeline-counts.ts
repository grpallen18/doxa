import { withNeo4jSession, getNeo4jConfig } from '@/lib/neo4j/server'

export type NeoPipelineCounts = {
  configured: boolean
  documents: number
  utterances: number
  propositions: number
  arguments: number
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
  controversiesWithSides: number
  controversiesZeroSides: number
  quarantinedQuestionMatch: number
  quarantinedQuestionAnswer: number
  controversies: number
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
  documents: 0,
  utterances: 0,
  propositions: 0,
  arguments: 0,
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
  controversiesWithSides: 0,
  controversiesZeroSides: 0,
  quarantinedQuestionMatch: 0,
  quarantinedQuestionAnswer: 0,
  controversies: 0,
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

/** Snapshot counts for Observability funnel (L0–L4 Neo labels). */
export async function getNeoPipelineCounts(): Promise<NeoPipelineCounts> {
  if (!getNeo4jConfig()) return { ...EMPTY }

  try {
    return await withNeo4jSession(async (session) => {
      const [base, degree, pool, sides, size] = await Promise.all([
        session.run(
          `
          OPTIONAL MATCH (doc:Document) WITH count(doc) AS documents
          OPTIONAL MATCH (u:Utterance) WITH documents, count(u) AS utterances
          OPTIONAL MATCH (p:Proposition) WITH documents, utterances, count(p) AS propositions
          OPTIONAL MATCH (arg:Argument) WITH documents, utterances, propositions, count(arg) AS arguments
          OPTIONAL MATCH (a:Agent) WITH documents, utterances, propositions, arguments, count(a) AS agents
          OPTIONAL MATCH (q:Question) WITH documents, utterances, propositions, arguments, agents, count(q) AS questions
          OPTIONAL MATCH (qd:Question)
          WHERE coalesce(qd.status, '') = 'developing'
          WITH documents, utterances, propositions, arguments, agents, questions, count(qd) AS questionsDeveloping
          OPTIONAL MATCH (qe:Question)
          WHERE qe.status = 'established'
          WITH documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
               count(qe) AS questionsEstablished
          OPTIONAL MATCH ()-[ans:ANSWERS]->(:Question)
          WITH documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
               questionsEstablished, count(ans) AS answersEdges
          OPTIONAL MATCH (dec:Decision)
          WHERE dec.status = 'quarantined'
            AND dec.decisionType = 'question_match'
          WITH documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
               questionsEstablished, answersEdges, count(dec) AS quarantinedQuestionMatch
          OPTIONAL MATCH (decA:Decision)
          WHERE decA.status = 'quarantined'
            AND decA.decisionType = 'question_answer'
          WITH documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
               questionsEstablished, answersEdges, quarantinedQuestionMatch,
               count(decA) AS quarantinedQuestionAnswer
          OPTIONAL MATCH (c:Controversy) WITH documents, utterances, propositions, arguments, agents,
               questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
               quarantinedQuestionAnswer, count(c) AS controversies
          OPTIONAL MATCH (v:Viewpoint) WITH documents, utterances, propositions, arguments, agents,
               questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
               quarantinedQuestionAnswer, controversies, count(v) AS viewpoints
          OPTIONAL MATCH (d:Dispute) WITH documents, utterances, propositions, arguments, agents,
               questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
               quarantinedQuestionAnswer, controversies, viewpoints, count(d) AS disputes
          OPTIONAL MATCH (ec:EvidenceCheck) WITH documents, utterances, propositions, arguments, agents,
               questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
               quarantinedQuestionAnswer, controversies, viewpoints, disputes, count(ec) AS evidenceChecks
          OPTIONAL MATCH (cit:Citation) WITH documents, utterances, propositions, arguments, agents,
               questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
               quarantinedQuestionAnswer, controversies, viewpoints, disputes, evidenceChecks,
               count(cit) AS citations
          OPTIONAL MATCH (ass:Assessment) WITH documents, utterances, propositions, arguments, agents,
               questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
               quarantinedQuestionAnswer, controversies, viewpoints, disputes, evidenceChecks, citations,
               count(ass) AS assessments
          OPTIONAL MATCH (pend:Decision)
          WHERE pend.status = 'pending'
            AND pend.decisionType = 'evidence_check_candidate'
          RETURN documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
                 questionsEstablished, answersEdges, quarantinedQuestionMatch, quarantinedQuestionAnswer,
                 controversies, viewpoints, disputes, evidenceChecks, citations, assessments,
                 count(pend) AS pendingEvidenceCheckCandidates
          `
        ),
        session.run(
          `
          MATCH (q:Question)
          OPTIONAL MATCH (:Proposition)-[a:ANSWERS]->(q)
          WITH q, count(a) AS ac
          RETURN
            sum(CASE WHEN ac = 0 THEN 1 ELSE 0 END) AS answersDegree0,
            sum(CASE WHEN ac = 1 THEN 1 ELSE 0 END) AS answersDegree1,
            sum(CASE WHEN ac >= 2 THEN 1 ELSE 0 END) AS answersDegree2Plus
          `
        ),
        session.run(
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
        ),
        session.run(
          `
          MATCH (c:Controversy {status: 'established'})
          OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
          WITH c, count(DISTINCT v) AS sideN
          RETURN
            sum(CASE WHEN sideN >= 2 THEN 1 ELSE 0 END) AS controversiesWithSides,
            sum(CASE WHEN sideN = 0 THEN 1 ELSE 0 END) AS controversiesZeroSides
          `
        ),
        session.run(
          `
          OPTIONAL MATCH (n)
          WITH count(n) AS graphNodes
          OPTIONAL MATCH ()-[r]->()
          RETURN graphNodes, count(r) AS graphRels
          `
        ),
      ])

      const record = base.records[0]
      if (!record) return { ...EMPTY, configured: true }

      const degreeRec = degree.records[0]
      const poolRec = pool.records[0]
      const sidesRec = sides.records[0]
      const sizeRec = size.records[0]

      return {
        configured: true,
        documents: asCount(record.get('documents')),
        utterances: asCount(record.get('utterances')),
        propositions: asCount(record.get('propositions')),
        arguments: asCount(record.get('arguments')),
        agents: asCount(record.get('agents')),
        questions: asCount(record.get('questions')),
        questionsDeveloping: asCount(record.get('questionsDeveloping')),
        questionsEstablished: asCount(record.get('questionsEstablished')),
        answersEdges: asCount(record.get('answersEdges')),
        answersDegree0: asCount(degreeRec?.get('answersDegree0')),
        answersDegree1: asCount(degreeRec?.get('answersDegree1')),
        answersDegree2Plus: asCount(degreeRec?.get('answersDegree2Plus')),
        qualifyPoolMultiHq: asCount(poolRec?.get('qualifyPoolMultiHq')),
        qualifyPoolOpposing: asCount(poolRec?.get('qualifyPoolOpposing')),
        controversiesWithSides: asCount(sidesRec?.get('controversiesWithSides')),
        controversiesZeroSides: asCount(sidesRec?.get('controversiesZeroSides')),
        quarantinedQuestionMatch: asCount(record.get('quarantinedQuestionMatch')),
        quarantinedQuestionAnswer: asCount(record.get('quarantinedQuestionAnswer')),
        controversies: asCount(record.get('controversies')),
        viewpoints: asCount(record.get('viewpoints')),
        disputes: asCount(record.get('disputes')),
        evidenceChecks: asCount(record.get('evidenceChecks')),
        citations: asCount(record.get('citations')),
        assessments: asCount(record.get('assessments')),
        pendingEvidenceCheckCandidates: asCount(
          record.get('pendingEvidenceCheckCandidates')
        ),
        graphNodes: asCount(sizeRec?.get('graphNodes')),
        graphRels: asCount(sizeRec?.get('graphRels')),
        nodeCap: AURA_FREE_NODE_CAP,
        relCap: AURA_FREE_REL_CAP,
      }
    })
  } catch {
    return { ...EMPTY }
  }
}
