/**
 * Shared L3 dossier builders. Driver-agnostic via QueryFn.
 */

import type { QueryFn } from "./proposal-validator.ts";
import { cosineSimilarity } from "./question-identity.ts";

export type DossierMember = {
  prop_uid: string;
  text: string;
  polarity: string | null;
  confidence: number;
  speaker: string | null;
  publication: string | null;
  published_at: string | null;
  utterance_uid: string | null;
  segment_text: string | null;
};

export type DossierCandidate = DossierMember & {
  score: number;
  method: string | null;
};

export type QuestionDossier = {
  question: {
    uid: string;
    text: string;
    type: string | null;
    exclusivity: string | null;
    status: string | null;
    expected_counter_thesis: string | null;
    blocking_key: string | null;
    member_count: number;
    candidate_count: number;
  };
  members: DossierMember[];
  candidates: DossierCandidate[];
  sibling_questions: Array<{ uid: string; text: string; cosine: number }>;
  prior_decisions: Array<{
    type: string | null;
    status: string | null;
    rationale: string | null;
    actor: string | null;
    at: string | null;
  }>;
};

function asMember(row: Record<string, unknown>, extra?: Partial<DossierCandidate>): DossierMember & Partial<DossierCandidate> {
  return {
    prop_uid: String(row.propUid ?? ""),
    text: String(row.text ?? ""),
    polarity: row.polarity != null ? String(row.polarity) : null,
    confidence: Number(row.confidence) || 0,
    speaker: row.speaker != null ? String(row.speaker) : null,
    publication: row.publication != null ? String(row.publication) : null,
    published_at: row.publishedAt != null ? String(row.publishedAt) : null,
    utterance_uid: row.utteranceUid != null ? String(row.utteranceUid) : null,
    segment_text: row.segmentText != null ? String(row.segmentText) : null,
    ...extra,
  };
}

export async function getQuestionDossier(
  query: QueryFn,
  questionUid: string
): Promise<QuestionDossier | null> {
  const qRows = await query<{
    uid: string;
    text: string;
    type: string | null;
    exclusivity: string | null;
    status: string | null;
    expectedCounter: string | null;
    blockingKey: string | null;
    embedding: number[] | null;
  }>(
    `
    MATCH (q:Question {uid: $uid})
    RETURN q.uid AS uid,
           q.question AS text,
           q.questionType AS type,
           q.answerExclusivity AS exclusivity,
           q.status AS status,
           q.expectedCounterThesis AS expectedCounter,
           q.blockingKey AS blockingKey,
           q.embedding AS embedding
    `,
    { uid: questionUid }
  );
  const q = qRows[0];
  if (!q) return null;

  const members = await query<Record<string, unknown>>(
    `
    MATCH (p:Proposition)-[a:ANSWERS]->(q:Question {uid: $uid})
    OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(ag:Agent)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})-[:PUBLISHED_BY]->(pub:Publication)
    WITH p, a, u, ag, seg, d, pub
    ORDER BY p.uid, u.uid
    WITH p, a, head(collect({
      utteranceUid: u.uid,
      speaker: coalesce(ag.name, ag.label),
      publication: pub.name,
      publishedAt: toString(d.publishedAt),
      segmentText: coalesce(seg.text, u.text)
    })) AS bag
    RETURN p.uid AS propUid,
           coalesce(p.text, p.normalizedText, '') AS text,
           a.polarity AS polarity,
           coalesce(a.confidence, 0) AS confidence,
           bag.speaker AS speaker,
           bag.publication AS publication,
           bag.publishedAt AS publishedAt,
           bag.utteranceUid AS utteranceUid,
           bag.segmentText AS segmentText
    `,
    { uid: questionUid }
  );

  const candidates = await query<Record<string, unknown>>(
    `
    MATCH (p:Proposition)-[c:CANDIDATE_FOR]->(q:Question {uid: $uid})
    WHERE NOT EXISTS { MATCH (p)-[:ANSWERS]->(q) }
    OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(ag:Agent)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})-[:PUBLISHED_BY]->(pub:Publication)
    WITH p, c, u, ag, seg, d, pub
    ORDER BY coalesce(c.score, 0) DESC, p.uid
    WITH p, c, head(collect({
      utteranceUid: u.uid,
      speaker: coalesce(ag.name, ag.label),
      publication: pub.name,
      publishedAt: toString(d.publishedAt),
      segmentText: coalesce(seg.text, u.text)
    })) AS bag
    RETURN p.uid AS propUid,
           coalesce(p.text, p.normalizedText, '') AS text,
           null AS polarity,
           coalesce(c.score, 0) AS confidence,
           bag.speaker AS speaker,
           bag.publication AS publication,
           bag.publishedAt AS publishedAt,
           bag.utteranceUid AS utteranceUid,
           bag.segmentText AS segmentText,
           c.method AS method,
           coalesce(c.score, 0) AS score
    LIMIT 40
    `,
    { uid: questionUid }
  );

  const siblingsRaw = await query<{
    uid: string;
    text: string;
    embedding: number[] | null;
  }>(
    `
    MATCH (q:Question)
    WHERE q.uid <> $uid AND q.embedding IS NOT NULL
    RETURN q.uid AS uid, q.question AS text, q.embedding AS embedding
    LIMIT 80
    `,
    { uid: questionUid }
  );
  const qEmb = q.embedding ?? [];
  const sibling_questions = siblingsRaw
    .map((s) => ({
      uid: s.uid,
      text: s.text,
      cosine: cosineSimilarity(qEmb, s.embedding ?? []),
    }))
    .filter((s) => s.cosine >= 0.35)
    .sort((a, b) => b.cosine - a.cosine)
    .slice(0, 8);

  const prior = await query<{
    type: string | null;
    status: string | null;
    rationale: string | null;
    actor: string | null;
    at: string | null;
  }>(
    `
    MATCH (d:Decision)-[:ABOUT]->(:Question {uid: $uid})
    RETURN d.decisionType AS type,
           d.status AS status,
           d.rationale AS rationale,
           d.actor AS actor,
           toString(d.updatedAt) AS at
    ORDER BY d.updatedAt DESC
    LIMIT 12
    `,
    { uid: questionUid }
  );

  return {
    question: {
      uid: q.uid,
      text: q.text,
      type: q.type,
      exclusivity: q.exclusivity,
      status: q.status,
      expected_counter_thesis: q.expectedCounter,
      blocking_key: q.blockingKey,
      member_count: members.length,
      candidate_count: candidates.length,
    },
    members: members.map((r) => asMember(r)),
    candidates: candidates.map((r) =>
      asMember(r, { score: Number(r.score) || 0, method: r.method != null ? String(r.method) : null })
    ),
    sibling_questions,
    prior_decisions: prior,
  };
}

export async function getMergeCandidates(query: QueryFn, questionUid: string) {
  const self = await query<{
    uid: string;
    blockingKey: string | null;
    embedding: number[] | null;
    questionType: string | null;
    question: string;
  }>(
    `
    MATCH (q:Question {uid: $uid})
    RETURN q.uid AS uid, q.blockingKey AS blockingKey, q.embedding AS embedding,
           q.questionType AS questionType, q.question AS question
    `,
    { uid: questionUid }
  );
  const q = self[0];
  if (!q) return [];
  const others = await query<{
    uid: string;
    question: string;
    blockingKey: string | null;
    embedding: number[] | null;
    questionType: string | null;
    memberCount: number;
  }>(
    `
    MATCH (o:Question)
    WHERE o.uid <> $uid
    OPTIONAL MATCH (p:Proposition)-[:ANSWERS]->(o)
    WITH o, count(p) AS memberCount
    RETURN o.uid AS uid, o.question AS question, o.blockingKey AS blockingKey,
           o.embedding AS embedding, o.questionType AS questionType, memberCount
    LIMIT 200
    `,
    { uid: questionUid }
  );
  return others
    .map((o) => {
      const sameKey = Boolean(q.blockingKey && o.blockingKey && q.blockingKey === o.blockingKey);
      const cosine = cosineSimilarity(q.embedding ?? [], o.embedding ?? []);
      return { ...o, cosine, same_key: sameKey };
    })
    .filter((o) => o.same_key || o.cosine >= 0.5)
    .sort((a, b) => Number(b.same_key) - Number(a.same_key) || b.cosine - a.cosine)
    .slice(0, 12);
}

export async function getCounterSideCandidates(query: QueryFn, questionUid: string) {
  const q = await query<{
    expected: string | null;
    conEmb: number[] | null;
    proEmb: number[] | null;
  }>(
    `
    MATCH (q:Question {uid: $uid})
    RETURN q.expectedCounterThesis AS expected,
           q.conAnswerEmbedding AS conEmb,
           q.proAnswerEmbedding AS proEmb
    `,
    { uid: questionUid }
  );
  const row = q[0];
  if (!row) return [];
  const target = row.conEmb ?? [];
  const props = await query<{
    propUid: string;
    text: string;
    embedding: number[] | null;
    utteranceUid: string | null;
    segmentText: string | null;
  }>(
    `
    MATCH (p:Proposition)
    WHERE p.embedding IS NOT NULL
      AND NOT EXISTS { MATCH (p)-[:ANSWERS]->(:Question {uid: $uid}) }
    OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    WITH p, head(collect({ uid: u.uid, text: coalesce(seg.text, u.text) })) AS bag
    RETURN p.uid AS propUid,
           coalesce(p.text, p.normalizedText, '') AS text,
           p.embedding AS embedding,
           bag.uid AS utteranceUid,
           bag.text AS segmentText
    LIMIT 400
    `,
    { uid: questionUid }
  );
  return props
    .map((p) => ({
      ...p,
      score: cosineSimilarity(target, p.embedding ?? []),
    }))
    .filter((p) => p.score >= 0.32)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

export async function getControversyDossier(query: QueryFn, controversyUid: string) {
  const rows = await query<{
    uid: string;
    questionUid: string;
    question: string;
    status: string | null;
    shared: string[] | null;
    clash: string[] | null;
  }>(
    `
    MATCH (c:Controversy {uid: $uid})-[:ABOUT]->(q:Question)
    RETURN c.uid AS uid, q.uid AS questionUid, q.question AS question,
           c.status AS status, c.sharedBullets AS shared, c.clashBullets AS clash
    `,
    { uid: controversyUid }
  );
  const c = rows[0];
  if (!c) return null;
  const dossier = await getQuestionDossier(query, c.questionUid);
  return { ...c, dossier };
}

export async function searchQuestions(query: QueryFn, text: string, k = 8) {
  const rows = await query<{ uid: string; question: string }>(
    `
    MATCH (q:Question)
    WHERE toLower(q.question) CONTAINS toLower($text)
    RETURN q.uid AS uid, q.question AS question
    LIMIT toInteger($k)
    `,
    { text, k }
  );
  return rows;
}
