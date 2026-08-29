// Supabase Edge Function: bind_candidates.
// Deterministic CANDIDATE_FOR edges (entity blocking + answer-form kNN). No ANSWERS writes.
// Body: { dry_run?, limit?, proposition_uid?, question_uid? }

import { corsHeaders, json, clampInt, requireInternalAuth } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import {
  CANDIDATE_MIN_COSINE,
  CANDIDATE_STRONG_COSINE,
  cosineSimilarity,
} from "../../../../lib/debate/question-identity.ts";
import { maxAnswerCosine } from "../../../../lib/debate/candidate-bind.ts";
import { lexicalNli, shouldBindCandidate } from "../../../../lib/debate/nli-rerank.ts";
import { resolveDebateRole, mayBeCandidateAnswer } from "../../../../lib/debate/debate-role.ts";

const DEFAULT_LIMIT = 80;

type QuestionRow = {
  uid: string;
  question: string;
  embedding: number[] | null;
  proEmb: number[] | null;
  conEmb: number[] | null;
  proStmt: string | null;
  conStmt: string | null;
  entityUids: string[] | null;
};

type PropRow = {
  uid: string;
  text: string;
  embedding: number[] | null;
  speechActs: string[] | null;
  roles: string[] | null;
  entityUids: string[] | null;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 200, DEFAULT_LIMIT);
  const onlyUid = typeof body.proposition_uid === "string" ? body.proposition_uid.trim() : "";
  const questionUid = typeof body.question_uid === "string" ? body.question_uid.trim() : "";

  const questions = await runCypher<QuestionRow>(
    `
    MATCH (q:Question)
    WHERE ($questionUid = '' OR q.uid = $questionUid)
    OPTIONAL MATCH (p:Proposition)-[:ANSWERS]->(q)<-[:EXPRESSES]-(u:Utterance)-[:MENTIONS]->(e:Entity)
    WITH q, collect(DISTINCT e.uid) AS entityUids
    RETURN q.uid AS uid,
           q.question AS question,
           q.embedding AS embedding,
           q.proAnswerEmbedding AS proEmb,
           q.conAnswerEmbedding AS conEmb,
           q.proAnswerStatement AS proStmt,
           q.conAnswerStatement AS conStmt,
           entityUids
    `,
    { questionUid }
  );

  if (!questions.length) {
    return json({ ok: true, dry_run: dryRun, questions: 0, bound: 0 });
  }

  const props = await runCypher<PropRow>(
    `
    MATCH (p:Proposition)
    WHERE ($onlyUid = '' OR p.uid = $onlyUid)
      AND coalesce(p.debateEligible, true) <> false
      AND NOT EXISTS { MATCH (p)-[:ANSWERS]->(:Question) }
    OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (u)-[:MENTIONS]->(e:Entity)
    OPTIONAL MATCH (p)<-[hr:HAS_ROLE]-()
    WITH p,
         [x IN collect(DISTINCT u.speechAct) WHERE x IS NOT NULL] AS speechActs,
         [x IN collect(DISTINCT hr.role) WHERE x IS NOT NULL] AS roles,
         [x IN collect(DISTINCT e.uid) WHERE x IS NOT NULL] AS entityUids
    RETURN p.uid AS uid,
           coalesce(p.text, p.normalizedText, '') AS text,
           p.embedding AS embedding,
           speechActs,
           roles,
           entityUids
    ORDER BY p.uid
    LIMIT $limit
    `,
    { onlyUid, limit: neoInt(limit) }
  );

  const eligible = props.filter((p) =>
    mayBeCandidateAnswer(resolveDebateRole({ speechActs: p.speechActs, hasRoles: p.roles }))
  );

  type Hit = { propUid: string; questionUid: string; score: number; method: string };
  const hits: Hit[] = [];

  for (const p of eligible) {
    const propEntities = new Set((p.entityUids ?? []).filter(Boolean));
    const propEmb = p.embedding ?? [];
    for (const q of questions) {
      const shared = (q.entityUids ?? []).some((e) => e && propEntities.has(e));
      const cosine = maxAnswerCosine(
        propEmb,
        q.proEmb,
        q.conEmb,
        q.embedding,
        cosineSimilarity
      );
      const nli = lexicalNli(p.text, `${q.proStmt ?? ""} ${q.conStmt ?? ""} ${q.question}`);
      if (
        !shouldBindCandidate({
          cosine,
          sharedEntity: shared,
          nli,
          minCosine: CANDIDATE_MIN_COSINE,
          strongCosine: CANDIDATE_STRONG_COSINE,
        })
      ) {
        continue;
      }
      hits.push({
        propUid: p.uid,
        questionUid: q.uid,
        score: Math.max(cosine, shared ? CANDIDATE_MIN_COSINE + 0.01 : 0),
        method: shared ? "entity" : cosine >= CANDIDATE_STRONG_COSINE ? "answer_knn" : "nli",
      });
    }
  }

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      questions: questions.length,
      scanned: eligible.length,
      would_bind: hits.length,
    });
  }

  if (hits.length) {
    await runCypher(
      `
      UNWIND $hits AS hit
      MATCH (p:Proposition {uid: hit.propUid})
      MATCH (q:Question {uid: hit.questionUid})
      MERGE (p)-[c:CANDIDATE_FOR]->(q)
      SET c.score = hit.score,
          c.method = hit.method,
          c.createdAt = coalesce(c.createdAt, datetime()),
          c.updatedAt = datetime()
      `,
      { hits }
    );
  }

  return json({
    ok: true,
    questions: questions.length,
    scanned: eligible.length,
    bound: hits.length,
  });
};
