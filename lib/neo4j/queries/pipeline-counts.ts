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
  quarantinedQuestionMatch: number
  controversies: number
  viewpoints: number
  disputes: number
  evidenceChecks: number
  citations: number
  assessments: number
  pendingEvidenceCheckCandidates: number
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && value != null && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

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
  quarantinedQuestionMatch: 0,
  controversies: 0,
  viewpoints: 0,
  disputes: 0,
  evidenceChecks: 0,
  citations: 0,
  assessments: 0,
  pendingEvidenceCheckCandidates: 0,
}

/** Snapshot counts for Observability funnel (L0–L4 Neo labels). */
export async function getNeoPipelineCounts(): Promise<NeoPipelineCounts> {
  if (!getNeo4jConfig()) return { ...EMPTY }

  try {
    return await withNeo4jSession(async (session) => {
      const result = await session.run(
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
          AND dec.decisionType IN ['question_match', 'question_answer']
        WITH documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
             questionsEstablished, answersEdges, count(dec) AS quarantinedQuestionMatch
        OPTIONAL MATCH (c:Controversy) WITH documents, utterances, propositions, arguments, agents,
             questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
             count(c) AS controversies
        OPTIONAL MATCH (v:Viewpoint) WITH documents, utterances, propositions, arguments, agents,
             questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
             controversies, count(v) AS viewpoints
        OPTIONAL MATCH (d:Dispute) WITH documents, utterances, propositions, arguments, agents,
             questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
             controversies, viewpoints, count(d) AS disputes
        OPTIONAL MATCH (ec:EvidenceCheck) WITH documents, utterances, propositions, arguments, agents,
             questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
             controversies, viewpoints, disputes, count(ec) AS evidenceChecks
        OPTIONAL MATCH (cit:Citation) WITH documents, utterances, propositions, arguments, agents,
             questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
             controversies, viewpoints, disputes, evidenceChecks, count(cit) AS citations
        OPTIONAL MATCH (ass:Assessment) WITH documents, utterances, propositions, arguments, agents,
             questions, questionsDeveloping, questionsEstablished, answersEdges, quarantinedQuestionMatch,
             controversies, viewpoints, disputes, evidenceChecks, citations, count(ass) AS assessments
        OPTIONAL MATCH (pend:Decision)
        WHERE pend.status = 'pending'
          AND pend.decisionType = 'evidence_check_candidate'
        RETURN documents, utterances, propositions, arguments, agents, questions, questionsDeveloping,
               questionsEstablished, answersEdges, quarantinedQuestionMatch, controversies, viewpoints,
               disputes, evidenceChecks, citations, assessments, count(pend) AS pendingEvidenceCheckCandidates
        `
      )

      const record = result.records[0]
      if (!record) return { ...EMPTY, configured: true }

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
        quarantinedQuestionMatch: asCount(record.get('quarantinedQuestionMatch')),
        controversies: asCount(record.get('controversies')),
        viewpoints: asCount(record.get('viewpoints')),
        disputes: asCount(record.get('disputes')),
        evidenceChecks: asCount(record.get('evidenceChecks')),
        citations: asCount(record.get('citations')),
        assessments: asCount(record.get('assessments')),
        pendingEvidenceCheckCandidates: asCount(
          record.get('pendingEvidenceCheckCandidates')
        ),
      }
    })
  } catch {
    return { ...EMPTY }
  }
}
