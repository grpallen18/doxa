import { withNeo4jSession, getNeo4jConfig } from '@/lib/neo4j/server'

export type GraphQuarantineRow = {
  uid: string
  decisionType: string | null
  label: string | null
  confidence: number | null
  candidateQuestion: string | null
  propositionUid: string | null
  propositionText: string | null
  questionUid: string | null
  questionText: string | null
  /** @deprecated Prefer propositionUid */
  propositionUids: string[]
  /** @deprecated Prefer questionUid */
  questionUids: string[]
  updatedAt: string | null
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

export async function listGraphQuarantineDecisions(
  limit = 100
): Promise<GraphQuarantineRow[]> {
  if (!getNeo4jConfig()) return []

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (dec:Decision)
      WHERE dec.status = 'quarantined'
        AND dec.decisionType IN ['question_match', 'question_answer']
      OPTIONAL MATCH (dec)-[:ABOUT]->(p:Proposition)
      OPTIONAL MATCH (dec)-[:ABOUT]->(q:Question)
      WITH dec,
           head(collect(DISTINCT p)) AS prop,
           head(collect(DISTINCT q)) AS question
      RETURN dec.uid AS uid,
             dec.decisionType AS decisionType,
             dec.label AS label,
             dec.confidence AS confidence,
             dec.candidateQuestion AS candidateQuestion,
             prop.uid AS propositionUid,
             coalesce(prop.text, prop.normalizedText) AS propositionText,
             question.uid AS questionUid,
             question.question AS questionText,
             toString(dec.updatedAt) AS updatedAt
      ORDER BY dec.updatedAt DESC
      LIMIT toInteger($limit)
      `,
      { limit }
    )

    return result.records.map((record) => {
      const propositionUid = asString(record.get('propositionUid'))
      const questionUid = asString(record.get('questionUid'))
      return {
        uid: asString(record.get('uid')) ?? '',
        decisionType: asString(record.get('decisionType')),
        label: asString(record.get('label')),
        confidence: asNumber(record.get('confidence')),
        candidateQuestion: asString(record.get('candidateQuestion')),
        propositionUid,
        propositionText: asString(record.get('propositionText')),
        questionUid,
        questionText: asString(record.get('questionText')),
        propositionUids: asStringArray(propositionUid ? [propositionUid] : []),
        questionUids: asStringArray(questionUid ? [questionUid] : []),
        updatedAt: asString(record.get('updatedAt')),
      }
    })
  })
}
