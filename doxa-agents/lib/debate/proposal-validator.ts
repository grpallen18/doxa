/**
 * Fail-closed validator for L3 curator/editor/auditor proposals.
 */

import {
  EVICT_CAP_FRACTION,
  MERGE_MIN_COSINE,
  HYSTERESIS_CONFIDENCE_DELTA,
  type MembershipOp,
  type MembershipProposalPayload,
  type ViewpointProposalPayload,
  type AuditVerdictPayload,
} from "./proposal-ops.ts";
import { isPrimaryCauseNearMiss, parsePolarity, parseQuestionType } from "./question-identity.ts";

export type QueryFn = <T extends Record<string, unknown> = Record<string, unknown>>(
  cypher: string,
  params?: Record<string, unknown>
) => Promise<T[]>;

export type OpValidation = {
  index: number;
  ok: boolean;
  errors: string[];
};

export type ProposalValidation = {
  ok: boolean;
  errors: string[];
  ops: OpValidation[];
};

const L3_ONLY_OP = new Set([
  "ADMIT",
  "EVICT",
  "SPLIT_QUESTION",
  "MERGE_QUESTION",
  "RETITLE_QUESTION",
  "MINT_QUESTION",
  "RETYPE_QUESTION",
  "MARK_INCOMPATIBLE",
  "MARK_ORTHOGONAL",
]);

export async function utteranceReachableFromProp(
  query: QueryFn,
  propUid: string,
  utteranceUid: string
): Promise<boolean> {
  const rows = await query<{ ok: number }>(
    `
    MATCH (p:Proposition {uid: $propUid})<-[:EXPRESSES]-(u:Utterance {uid: $utteranceUid})
    RETURN 1 AS ok
    LIMIT 1
    `,
    { propUid, utteranceUid }
  );
  return rows.length > 0;
}

async function utteranceExists(query: QueryFn, utteranceUid: string): Promise<boolean> {
  const rows = await query<{ ok: number }>(
    `MATCH (u:Utterance {uid: $utteranceUid}) RETURN 1 AS ok LIMIT 1`,
    { utteranceUid }
  );
  return rows.length > 0;
}

/** How many distinct propositions the cited utterances express (MINT founding check). */
async function distinctPropositionCount(
  query: QueryFn,
  utteranceUids: string[]
): Promise<number> {
  if (!utteranceUids.length) return 0;
  const rows = await query<{ n: number }>(
    `
    MATCH (u:Utterance)-[:EXPRESSES]->(p:Proposition)
    WHERE u.uid IN $uids
    RETURN count(DISTINCT p) AS n
    `,
    { uids: utteranceUids }
  );
  return Number(rows[0]?.n ?? 0);
}

export async function validateMembershipProposal(
  query: QueryFn,
  payload: MembershipProposalPayload,
  opts?: { memberCount?: number }
): Promise<ProposalValidation> {
  const errors: string[] = [];
  const ops: OpValidation[] = [];
  if (!payload.question_uid) errors.push("missing question_uid");
  if (!payload.ops?.length) errors.push("no ops");

  const qRows = await query<{ uid: string; questionType: string | null; question: string }>(
    `
    MATCH (q:Question {uid: $uid})
    RETURN q.uid AS uid, q.questionType AS questionType, q.question AS question
    `,
    { uid: payload.question_uid }
  );
  const question = qRows[0];
  if (!question && payload.ops.some((o) => o.type !== "MINT_QUESTION")) {
    errors.push(`unknown question ${payload.question_uid}`);
  }

  const memberCount =
    opts?.memberCount ??
    Number(
      (
        await query<{ n: number }>(
          `MATCH (:Proposition)-[:ANSWERS]->(q:Question {uid: $uid}) RETURN count(*) AS n`,
          { uid: payload.question_uid }
        )
      )[0]?.n ?? 0
    );

  let evictCount = 0;
  for (let i = 0; i < (payload.ops ?? []).length; i++) {
    const op = payload.ops[i];
    const opErrors: string[] = [];
    if (!L3_ONLY_OP.has(op.type)) opErrors.push(`unknown op ${op.type}`);
    if (!op.cited_utterance_uids?.length) opErrors.push("missing cited_utterance_uids");
    if (op.confidence < 0 || op.confidence > 1) opErrors.push("confidence out of range");

    const cited = op.cited_utterance_uids ?? [];
    if (op.type === "MINT_QUESTION") {
      // A question is founded by >= 2 distinct propositions, so its citations cannot
      // all be reachable from one proposition. Each must exist; an optional anchor
      // (the first member attached by the applier) must be among them.
      for (const utt of cited) {
        if (!(await utteranceExists(query, utt))) opErrors.push(`unknown utterance ${utt}`);
      }
      if (cited.length < 2) {
        opErrors.push("MINT requires at least two founding utterances");
      } else if ((await distinctPropositionCount(query, cited)) < 2) {
        opErrors.push("MINT founding utterances must express at least two distinct propositions");
      }
      if (op.prop_uid) {
        let anchored = false;
        for (const utt of cited) {
          if (await utteranceReachableFromProp(query, op.prop_uid, utt)) {
            anchored = true;
            break;
          }
        }
        if (!anchored) opErrors.push(`no cited utterance expresses anchor ${op.prop_uid}`);
      }
    } else {
      for (const utt of cited) {
        if (op.prop_uid) {
          const ok = await utteranceReachableFromProp(query, op.prop_uid, utt);
          if (!ok) opErrors.push(`utterance ${utt} not reachable from ${op.prop_uid}`);
        } else if (!(await utteranceExists(query, utt))) {
          opErrors.push(`unknown utterance ${utt}`);
        }
      }
    }

    if (op.type === "ADMIT" || op.type === "EVICT") {
      if (!op.prop_uid) opErrors.push("missing prop_uid");
      if (op.type === "ADMIT" && !parsePolarity(op.polarity)) {
        opErrors.push("ADMIT requires polarity in question vocabulary");
      }
      if (op.type === "EVICT") evictCount += 1;
    }

    if (op.type === "MERGE_QUESTION") {
      if (!op.target_question_uid) opErrors.push("MERGE requires target_question_uid");
      if (question && op.target_question_uid) {
        const other = await query<{ questionType: string | null; question: string; embedding: number[] | null }>(
          `
          MATCH (q:Question {uid: $uid})
          RETURN q.questionType AS questionType, q.question AS question, q.embedding AS embedding
          `,
          { uid: op.target_question_uid }
        );
        const tgt = other[0];
        if (!tgt) opErrors.push("merge target missing");
        else {
          if (
            question.questionType &&
            tgt.questionType &&
            question.questionType !== tgt.questionType
          ) {
            opErrors.push("no cross-type question merge");
          }
          if (isPrimaryCauseNearMiss(question.question, tgt.question)) {
            opErrors.push("primary-cause vs open-cause must stay adjacent");
          }
        }
      }
    }

    if (op.type === "RETYPE_QUESTION") {
      if (!parseQuestionType(op.question_type)) opErrors.push("RETYPE requires question_type");
    }

    if (op.type === "MINT_QUESTION" || op.type === "SPLIT_QUESTION") {
      if (!op.new_question_text?.trim()) opErrors.push("missing new_question_text");
    }

    if (op.type === "ADMIT" || op.type === "EVICT") {
      const prior = await query<{
        status: string;
        confidence: number;
        decisionType: string;
        opType: string | null;
        rationale: string | null;
      }>(
        `
        MATCH (d:Decision)-[:ABOUT]->(:Proposition {uid: $propUid})
        MATCH (d)-[:ABOUT]->(:Question {uid: $questionUid})
        WHERE d.decisionType IN ['l3_membership', 'question_answer']
        RETURN d.status AS status,
               coalesce(d.confidence, 0) AS confidence,
               d.decisionType AS decisionType,
               d.opType AS opType,
               d.rationale AS rationale
        ORDER BY d.updatedAt DESC
        LIMIT 1
        `,
        { propUid: op.prop_uid ?? "", questionUid: payload.question_uid }
      );
      const last = prior[0];
      if (last && last.status === "accepted") {
        const lastOp =
          last.opType ||
          (String(last.rationale ?? "").startsWith("EVICT:") ? "EVICT" : "ADMIT");
        const reversing =
          (op.type === "EVICT" && lastOp === "ADMIT") ||
          (op.type === "ADMIT" && lastOp === "EVICT");
        if (reversing && op.confidence < last.confidence + HYSTERESIS_CONFIDENCE_DELTA) {
          opErrors.push("hysteresis: reversing a prior decision needs higher confidence");
        }
      }
    }

    ops.push({ index: i, ok: opErrors.length === 0, errors: opErrors });
  }

  if (memberCount > 0 && evictCount / memberCount > EVICT_CAP_FRACTION + 1e-9) {
    errors.push(`evict blast-radius ${evictCount}/${memberCount} exceeds ${EVICT_CAP_FRACTION}`);
  }

  const opFailed = ops.filter((o) => !o.ok);
  return {
    ok: errors.length === 0 && opFailed.length === 0,
    errors,
    ops,
  };
}

export function validateViewpointProposal(payload: ViewpointProposalPayload): ProposalValidation {
  const errors: string[] = [];
  const ops: OpValidation[] = [];
  if (!payload.question_uid) errors.push("missing question_uid");
  if (!payload.polarity) errors.push("missing polarity");
  if (!payload.clusters?.length) errors.push("no clusters");
  (payload.clusters ?? []).forEach((c, i) => {
    const opErrors: string[] = [];
    if (!c.key_point?.trim()) opErrors.push("missing key_point");
    if (!c.member_prop_uids?.length) opErrors.push("empty member_prop_uids");
    if (!c.cited_utterance_uids?.length) opErrors.push("missing cited_utterance_uids");
    ops.push({ index: i, ok: opErrors.length === 0, errors: opErrors });
  });
  return {
    ok: errors.length === 0 && ops.every((o) => o.ok),
    errors,
    ops,
  };
}

export function validateAuditVerdict(payload: AuditVerdictPayload): ProposalValidation {
  const errors: string[] = [];
  if (!payload.controversy_uid) errors.push("missing controversy_uid");
  if (payload.verdict !== "pass" && payload.verdict !== "block") errors.push("bad verdict");
  if (!payload.weakest_member_uid) errors.push("auditor must name weakest_member_uid");
  if (!payload.cited_utterance_uids?.length) errors.push("missing cited_utterance_uids");
  if (!payload.reason?.trim()) errors.push("missing reason");
  return { ok: errors.length === 0, errors, ops: [] };
}

export { MERGE_MIN_COSINE };
