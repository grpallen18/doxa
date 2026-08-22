/**
 * Dispute detection for Question-first L3 (definitional + intra-Question pairs).
 */

import {
  DISPUTE_KINDS,
  parsePropositionKind,
  type PropositionRelationshipKind,
} from "./proposition-taxonomy.ts";
import { ESTABLISH_MIN_CONFIDENCE } from "./qualify-controversy.ts";
import type { AnswerAssignment } from "./qualify-controversy.ts";

export const DISPUTE_SCHEMA_VERSION = "3.0.0-dispute";
export const INTRA_PAIR_MIN_CONFIDENCE = 0.75;

export type DisputeEvaluateInput = {
  questionUid: string;
  questionType: string | null;
  assignments: AnswerAssignment[];
};

export type DisputeEvaluateResult = {
  qualifies: boolean;
  reason: string;
  memberPropUids: string[];
};

function thesisAssignments(
  assignments: AnswerAssignment[],
  minConfidence: number
): AnswerAssignment[] {
  return assignments.filter(
    (a) =>
      (a.debateRole == null || a.debateRole === "thesis") &&
      a.confidence >= minConfidence &&
      a.polarity !== "NONE" &&
      a.polarity !== "UNCERTAIN"
  );
}

function thesisAssignmentsForDispute(
  assignments: AnswerAssignment[],
  minConfidence: number
): AnswerAssignment[] {
  return assignments.filter(
    (a) =>
      (a.debateRole == null || a.debateRole === "thesis") &&
      a.confidence >= minConfidence &&
      a.polarity !== "UNCERTAIN"
  );
}

/** Definitional Questions with ≥2 accepted theses surface a structural Dispute. */
export function evaluateDefinitionalDispute(
  input: DisputeEvaluateInput,
  minConfidence = ESTABLISH_MIN_CONFIDENCE
): DisputeEvaluateResult {
  const empty = { qualifies: false, reason: "none", memberPropUids: [] as string[] };
  const qType = String(input.questionType ?? "unknown").toLowerCase();
  if (qType !== "definitional") {
    return { ...empty, reason: "not_definitional" };
  }
  const theses = thesisAssignmentsForDispute(input.assignments, minConfidence);
  const uids = [...new Set(theses.map((t) => t.propUid))];
  if (uids.length < 2) {
    return { ...empty, reason: "insufficient_theses", memberPropUids: uids };
  }
  return {
    qualifies: true,
    reason: "definitional_multi_thesis",
    memberPropUids: uids,
  };
}

export function disputeUidFromPair(
  kind: string,
  propA: string,
  propB: string
): string {
  const [a, b] = propA < propB ? [propA, propB] : [propB, propA];
  return `dsp:${kind}:${a}:${b}`.slice(0, 200);
}

export function isDisputeRelationshipKind(kind: string): kind is PropositionRelationshipKind {
  return DISPUTE_KINDS.includes(kind as PropositionRelationshipKind);
}

export async function classifyIntraQuestionPair(
  apiKey: string,
  question: string,
  textA: string,
  textB: string,
  model = "gpt-4o-mini"
): Promise<{ kind: PropositionRelationshipKind; confidence: number; rationale: string }> {
  const system = `Two propositions answer the same contested question. Classify their relationship.
Return ONLY JSON: {"kind":"definitional_conflict|talking_past|assumption_conflict|orthogonal|unrelated","confidence":0.0-1.0,"rationale":"..."}
Use definitional_conflict when they disagree on terms/meaning; talking_past when they address different framings; assumption_conflict when hidden premises clash.
Use unrelated or orthogonal when not a dispute kind. Prefer under-claim.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            question,
            proposition_a: textA,
            proposition_b: textB,
          }),
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI intra-pair ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const kind = parsePropositionKind(parsed.kind) ?? "unrelated";
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  return {
    kind,
    confidence,
    rationale: String(parsed.rationale ?? kind).slice(0, 400),
  };
}
