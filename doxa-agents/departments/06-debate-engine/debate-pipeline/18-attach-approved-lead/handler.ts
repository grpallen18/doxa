// Supabase Edge Function: attach_approved_lead.
// After graph extraction, bind approved-lead stories to the intended Question.
// Body: { dry_run?, limit?, story_id? }

import { createClient } from "npm:@supabase/supabase-js@2";
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

const DEFAULT_LIMIT = 20;

type QuestionRow = {
  uid: string;
  question: string;
  embedding: number[] | null;
  proEmb: number[] | null;
  conEmb: number[] | null;
  proStmt: string | null;
  conStmt: string | null;
};

type PropRow = {
  uid: string;
  text: string;
  embedding: number[] | null;
  speechActs: string[] | null;
  roles: string[] | null;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 50, DEFAULT_LIMIT);
  const onlyStory = typeof body.story_id === "string" ? body.story_id.trim() : "";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let query = supabase
    .from("stories")
    .select("story_id, metadata, graph_status")
    .not("metadata->approved_lead", "is", null)
    .eq("graph_status", "succeeded")
    .limit(limit);
  if (onlyStory) query = query.eq("story_id", onlyStory);

  const { data: stories, error } = await query;
  if (error) return json({ error: error.message }, 500);

  if (dryRun) {
    return json({ ok: true, dry_run: true, stories: stories?.length ?? 0 });
  }

  let bound = 0;
  let scanned = 0;
  for (const story of stories ?? []) {
    const meta = (story.metadata ?? {}) as { approved_lead?: { question_uid?: string } };
    const questionUid = String(meta.approved_lead?.question_uid ?? "").trim();
    const storyId = String(story.story_id);
    if (!questionUid) continue;
    scanned += 1;

    const questions = await runCypher<QuestionRow>(
      `
      MATCH (q:Question {uid: $questionUid})
      RETURN q.uid AS uid,
             q.question AS question,
             q.embedding AS embedding,
             q.proAnswerEmbedding AS proEmb,
             q.conAnswerEmbedding AS conEmb,
             q.proAnswerStatement AS proStmt,
             q.conAnswerStatement AS conStmt
      `,
      { questionUid }
    );
    const q = questions[0];
    if (!q) continue;

    const props = await runCypher<PropRow>(
      `
      MATCH (d:Document {uid: $storyId})-[:CONTAINS]->(:Segment)<-[:GROUNDED_IN]-(u:Utterance)-[:EXPRESSES]->(p:Proposition)
      WHERE coalesce(p.debateEligible, true) <> false
        AND NOT EXISTS { MATCH (p)-[:ANSWERS]->(:Question) }
      OPTIONAL MATCH (p)<-[hr:HAS_ROLE]-()
      WITH p, collect(DISTINCT u.speechAct) AS speechActs, collect(DISTINCT hr.role) AS roles
      RETURN p.uid AS uid,
             coalesce(p.text, p.normalizedText, '') AS text,
             p.embedding AS embedding,
             speechActs,
             roles
      LIMIT $limit
      `,
      { storyId, limit: neoInt(40) }
    );

    const hits: Array<{ propUid: string; questionUid: string; score: number; method: string }> = [];
    for (const p of props) {
      if (!mayBeCandidateAnswer(resolveDebateRole({ speechActs: p.speechActs, hasRoles: p.roles }))) {
        continue;
      }
      const cosine = maxAnswerCosine(
        p.embedding ?? [],
        q.proEmb,
        q.conEmb,
        q.embedding,
        cosineSimilarity
      );
      const nli = lexicalNli(p.text, `${q.proStmt ?? ""} ${q.conStmt ?? ""} ${q.question}`);
      if (
        !shouldBindCandidate({
          cosine,
          sharedEntity: false,
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
        score: cosine,
        method: "approved_lead",
      });
    }

    if (!hits.length) continue;
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
    bound += hits.length;
  }

  return json({ ok: true, stories: scanned, bound });
};
