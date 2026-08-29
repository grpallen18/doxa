/**
 * Apply validated L3 membership ops to Neo4j. Never called with unvalidated ops.
 */

import { controversyUidFromQuestion } from "./qualify-controversy.ts";
import type { QueryFn } from "./proposal-validator.ts";
import type { MembershipOp, MembershipProposalPayload, ViewpointProposalPayload } from "./proposal-ops.ts";
import {
  blockingKeyFrom,
  defaultAnswerStatements,
  ensureQuestionMark,
  parseExclusivity,
  parsePolarity,
  parseQuestionType,
  predicateLemmaFromQuestion,
  questionUidFromText,
  QUESTION_SCHEMA_VERSION,
} from "./question-identity.ts";
import { assignStableUids } from "./stable-identity.ts";
import { embedTexts } from "./question-identity.ts";

export type ApplyResult = {
  applied: number;
  skipped: number;
  errors: string[];
};

async function writeDecision(
  query: QueryFn,
  params: {
    decisionUid: string;
    decisionType: string;
    status: string;
    actor: string;
    confidence: number;
    rationale: string;
    proposalUid: string;
    botId: string;
    opType?: string;
    polarity?: string;
    propUid?: string;
    questionUid?: string;
    controversyUid?: string;
  }
) {
  await query(
    `
    MERGE (dec:Decision {uid: $decisionUid})
    SET dec.decisionType = $decisionType,
        dec.status = $status,
        dec.actor = $actor,
        dec.confidence = $confidence,
        dec.rationale = $rationale,
        dec.proposalUid = $proposalUid,
        dec.botId = $botId,
        dec.opType = $opType,
        dec.polarity = $polarity,
        dec.createdAt = coalesce(dec.createdAt, datetime()),
        dec.updatedAt = datetime()
    WITH dec
    FOREACH (_ IN CASE WHEN $propUid <> '' THEN [1] ELSE [] END |
      MERGE (p:Proposition {uid: $propUid})
      MERGE (dec)-[:ABOUT]->(p)
    )
    FOREACH (_ IN CASE WHEN $questionUid <> '' THEN [1] ELSE [] END |
      MERGE (q:Question {uid: $questionUid})
      MERGE (dec)-[:ABOUT]->(q)
    )
    FOREACH (_ IN CASE WHEN $controversyUid <> '' THEN [1] ELSE [] END |
      MERGE (c:Controversy {uid: $controversyUid})
      MERGE (dec)-[:ABOUT]->(c)
    )
    `,
    {
      ...params,
      polarity: params.polarity ?? "",
      opType: params.opType ?? "",
      propUid: params.propUid ?? "",
      questionUid: params.questionUid ?? "",
      controversyUid: params.controversyUid ?? "",
    }
  );
}

async function refreshQuestionEmbeddings(
  query: QueryFn,
  params: {
    uid: string;
    question: string;
    pro: string;
    con: string;
    apiKey?: string;
  }
) {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) return;
  try {
    const embs = await embedTexts(apiKey, [params.question, params.pro, params.con]);
    await query(
      `
      MATCH (q:Question {uid: $uid})
      SET q.embedding = $qEmb,
          q.proAnswerEmbedding = $proEmb,
          q.conAnswerEmbedding = $conEmb
      `,
      {
        uid: params.uid,
        qEmb: embs[0] ?? [],
        proEmb: embs[1] ?? [],
        conEmb: embs[2] ?? [],
      }
    );
  } catch {
    /* statements remain; kNN waits for a later seed/bind refresh */
  }
}

export async function applyMembershipOp(
  query: QueryFn,
  questionUid: string,
  op: MembershipOp,
  meta: { proposalUid: string; botId: string; actor: string; openaiApiKey?: string }
): Promise<void> {
  const decisionUid = `l3mem:${meta.proposalUid}:${op.type}:${op.prop_uid ?? op.target_question_uid ?? "q"}`.slice(
    0,
    180
  );

  if (op.type === "ADMIT" && op.prop_uid) {
    const polarity = parsePolarity(op.polarity) ?? "NONE";
    await query(
      `
      MATCH (p:Proposition {uid: $propUid})
      MATCH (q:Question {uid: $questionUid})
      MERGE (p)-[a:ANSWERS]->(q)
      SET a.polarity = $polarity,
          a.confidence = $confidence,
          a.debateRole = 'thesis',
          a.decisionUid = $decisionUid,
          a.updatedAt = datetime()
      SET q.lastReviewedAt = datetime()
      `,
      {
        propUid: op.prop_uid,
        questionUid,
        polarity,
        confidence: op.confidence,
        decisionUid,
      }
    );
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_membership",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: op.rationale,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      polarity,
      propUid: op.prop_uid,
      questionUid,
      opType: op.type,
    });
    return;
  }

  if (op.type === "EVICT" && op.prop_uid) {
    await query(
      `
      MATCH (p:Proposition {uid: $propUid})-[a:ANSWERS]->(q:Question {uid: $questionUid})
      DELETE a
      SET q.lastReviewedAt = datetime()
      `,
      { propUid: op.prop_uid, questionUid }
    );
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_membership",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: `EVICT: ${op.rationale}`,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      propUid: op.prop_uid,
      questionUid,
      opType: op.type,
    });
    return;
  }

  if (op.type === "RETITLE_QUESTION" && op.new_question_text) {
    const question = ensureQuestionMark(op.new_question_text);
    const statements = defaultAnswerStatements(question, op.question_type ?? null);
    await query(
      `
      MATCH (q:Question {uid: $questionUid})
      SET q.question = $question,
          q.aliases = coalesce(q.aliases, []) + CASE WHEN q.question = $question THEN [] ELSE [q.question] END,
          q.proAnswerStatement = $pro,
          q.conAnswerStatement = $con,
          q.expectedCounterThesis = $con,
          q.lastReviewedAt = datetime(),
          q.updatedAt = datetime()
      `,
      { questionUid, question, pro: statements.pro, con: statements.con }
    );
    await refreshQuestionEmbeddings(query, {
      uid: questionUid,
      question,
      pro: statements.pro,
      con: statements.con,
      apiKey: meta.openaiApiKey,
    });
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_membership",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: op.rationale,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      questionUid,
      opType: op.type,
    });
    return;
  }

  if (op.type === "RETYPE_QUESTION") {
    const qt = parseQuestionType(op.question_type) ?? "factual";
    const ex = parseExclusivity(op.exclusivity) ?? "unknown";
    await query(
      `
      MATCH (q:Question {uid: $questionUid})
      SET q.questionType = $qt,
          q.answerExclusivity = $ex,
          q.lastReviewedAt = datetime(),
          q.updatedAt = datetime()
      `,
      { questionUid, qt, ex }
    );
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_retype",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: op.rationale,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      questionUid,
      opType: op.type,
    });
    return;
  }

  if (op.type === "MERGE_QUESTION" && op.target_question_uid) {
    const keep = questionUid;
    const drop = op.target_question_uid;
    await query(
      `
      MATCH (keep:Question {uid: $keep})
      MATCH (p:Proposition)-[a:ANSWERS]->(drop:Question {uid: $drop})
      MERGE (p)-[a2:ANSWERS]->(keep)
      SET a2.polarity = coalesce(a2.polarity, a.polarity),
          a2.confidence = coalesce(a2.confidence, a.confidence),
          a2.debateRole = coalesce(a2.debateRole, a.debateRole, 'thesis'),
          a2.updatedAt = datetime()
      DELETE a
      `,
      { keep, drop }
    );
    await query(
      `
      MATCH (keep:Question {uid: $keep})
      MATCH (p:Proposition)-[c:CANDIDATE_FOR]->(drop:Question {uid: $drop})
      MERGE (p)-[c2:CANDIDATE_FOR]->(keep)
      SET c2.method = coalesce(c2.method, 'merge'),
          c2.score = coalesce(c2.score, c.score, 0.5),
          c2.updatedAt = datetime()
      DELETE c
      `,
      { keep, drop }
    );
    await query(
      `
      MATCH (keep:Question {uid: $keep})
      MATCH (drop:Question {uid: $drop})
      MERGE (drop)-[:VARIANT_OF]->(keep)
      SET keep.aliases = coalesce(keep.aliases, []) + [drop.question],
          keep.lastReviewedAt = datetime()
      WITH drop
      OPTIONAL MATCH (c:Controversy)-[:ABOUT]->(drop)
      DETACH DELETE c
      `,
      { keep, drop }
    );
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_merge",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: op.rationale,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      questionUid: keep,
      opType: op.type,
    });
    return;
  }

  if ((op.type === "MINT_QUESTION" || op.type === "SPLIT_QUESTION") && op.new_question_text) {
    const question = ensureQuestionMark(op.new_question_text);
    const uid = await questionUidFromText(question);
    const qt = parseQuestionType(op.question_type) ?? "factual";
    const ex = parseExclusivity(op.exclusivity) ?? "unknown";
    const statements = defaultAnswerStatements(question, qt);
    const blockingKey = blockingKeyFrom({
      questionType: qt,
      predicateLemma: predicateLemmaFromQuestion(question),
    });
    await query(
      `
      MERGE (q:Question {uid: $uid})
      ON CREATE SET q.createdAt = datetime(), q.status = 'developing', q.confidence = $confidence
      SET q.question = $question,
          q.questionType = $qt,
          q.answerExclusivity = $ex,
          q.proAnswerStatement = $pro,
          q.conAnswerStatement = $con,
          q.expectedCounterThesis = $con,
          q.blockingKey = $blockingKey,
          q.schemaVersion = $schemaVersion,
          q.updatedAt = datetime()
      `,
      {
        uid,
        question,
        qt,
        ex,
        pro: statements.pro,
        con: statements.con,
        blockingKey,
        confidence: op.confidence,
        schemaVersion: QUESTION_SCHEMA_VERSION,
      }
    );
    await refreshQuestionEmbeddings(query, {
      uid,
      question,
      pro: statements.pro,
      con: statements.con,
      apiKey: meta.openaiApiKey,
    });
    if (op.prop_uid) {
      await query(
        `
        MATCH (p:Proposition {uid: $propUid})
        MATCH (q:Question {uid: $uid})
        MERGE (p)-[a:ANSWERS]->(q)
        SET a.polarity = coalesce($polarity, 'NONE'),
            a.confidence = $confidence,
            a.debateRole = 'thesis',
            a.updatedAt = datetime()
        `,
        {
          propUid: op.prop_uid,
          uid,
          polarity: parsePolarity(op.polarity) ?? "NONE",
          confidence: op.confidence,
        }
      );
    }
    if (op.type === "SPLIT_QUESTION" && op.prop_uid) {
      await query(
        `
        MATCH (p:Proposition {uid: $propUid})-[a:ANSWERS]->(:Question {uid: $from})
        DELETE a
        `,
        { propUid: op.prop_uid, from: questionUid }
      );
    }
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_mint",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: op.rationale,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      propUid: op.prop_uid,
      questionUid: uid,
      opType: op.type,
    });
    return;
  }

  if (op.type === "MARK_INCOMPATIBLE" || op.type === "MARK_ORTHOGONAL") {
    await writeDecision(query, {
      decisionUid,
      decisionType: "l3_membership",
      status: "accepted",
      actor: meta.actor,
      confidence: op.confidence,
      rationale: `${op.type}: ${op.rationale}`,
      proposalUid: meta.proposalUid,
      botId: meta.botId,
      questionUid,
      polarity: op.type === "MARK_ORTHOGONAL" ? "orthogonal" : "incompatible",
      opType: op.type,
    });
  }
}

export async function applyMembershipProposal(
  query: QueryFn,
  payload: MembershipProposalPayload,
  meta: { proposalUid: string; botId: string; actor: string; openaiApiKey?: string }
): Promise<ApplyResult> {
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const op of payload.ops) {
    try {
      await applyMembershipOp(query, payload.question_uid, op, meta);
      applied += 1;
    } catch (err) {
      skipped += 1;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { applied, skipped, errors };
}

export async function applyViewpointProposal(
  query: QueryFn,
  payload: ViewpointProposalPayload,
  meta: { proposalUid: string; botId: string; actor: string }
): Promise<ApplyResult> {
  const existing = await query<{ uid: string; memberIds: string[] }>(
    `
    MATCH (v:Viewpoint {questionUid: $questionUid, polarity: $polarity})
    OPTIONAL MATCH (v)-[:ADVANCES]->(p:Proposition)
    RETURN v.uid AS uid, collect(p.uid) AS memberIds
    `,
    { questionUid: payload.question_uid, polarity: payload.polarity }
  );

  const components = payload.clusters.map((c) => ({
    memberIds: c.member_prop_uids,
    topicKey: payload.question_uid,
    keyPoint: c.key_point,
    summary: c.summary,
    label: c.label ?? c.key_point,
    confidence: c.confidence,
  }));
  const assigned = assignStableUids(components, existing, "vp");

  const ctrUid = controversyUidFromQuestion(payload.question_uid);

  await query(
    `
    MATCH (v:Viewpoint {questionUid: $questionUid, polarity: $polarity})
    DETACH DELETE v
    `,
    { questionUid: payload.question_uid, polarity: payload.polarity }
  );

  for (const cluster of assigned) {
    await query(
      `
      MATCH (q:Question {uid: $questionUid})
      MERGE (v:Viewpoint {uid: $uid})
      SET v.questionUid = $questionUid,
          v.polarity = $polarity,
          v.keyPoint = $keyPoint,
          v.summary = $summary,
          v.label = $label,
          v.memberCount = $memberCount,
          v.schemaVersion = '4.0.0-viewpoint',
          v.updatedAt = datetime(),
          v.createdAt = coalesce(v.createdAt, datetime())
      MERGE (v)-[:ANSWERS_SIDE]->(q)
      WITH v
      UNWIND $memberIds AS propUid
      MATCH (p:Proposition {uid: propUid})
      MERGE (v)-[:ADVANCES]->(p)
      WITH v
      OPTIONAL MATCH (c:Controversy {uid: $ctrUid})
      FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END |
        MERGE (c)-[:INCLUDES]->(v)
      )
      `,
      {
        uid: cluster.uid,
        questionUid: payload.question_uid,
        polarity: payload.polarity,
        keyPoint: cluster.keyPoint,
        summary: cluster.summary,
        label: cluster.label,
        memberCount: cluster.memberIds.length,
        memberIds: cluster.memberIds,
        ctrUid,
      }
    );
  }

  if (payload.shared_bullets?.length || payload.clash_bullets?.length) {
    await query(
      `
      MATCH (c:Controversy {uid: $ctrUid})
      SET c.sharedBullets = $shared,
          c.clashBullets = $clash,
          c.updatedAt = datetime()
      `,
      {
        ctrUid,
        shared: payload.shared_bullets ?? [],
        clash: payload.clash_bullets ?? [],
      }
    );
  }

  await writeDecision(query, {
    decisionUid: `l3vp:${meta.proposalUid}`.slice(0, 180),
    decisionType: "l3_viewpoint",
    status: "accepted",
    actor: meta.actor,
    confidence: 1,
    rationale: `viewpoints polarity=${payload.polarity} n=${assigned.length}`,
    proposalUid: meta.proposalUid,
    botId: meta.botId,
    questionUid: payload.question_uid,
    controversyUid: ctrUid,
    opType: "VIEWPOINT",
  });

  return { applied: assigned.length, skipped: 0, errors: [] };
}
