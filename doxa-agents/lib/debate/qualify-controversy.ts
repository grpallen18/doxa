/**
 * Structural Controversy qualification from ANSWERS assignments (no LLM).
 */

import type { AnswerExclusivity, AnswerPolarity, QuestionType } from "./question-identity.ts";

export const CONTROVERSY_SCHEMA_VERSION = "3.0.0-controversy";
export const ESTABLISH_MIN_CONFIDENCE = 0.7;

export type AnswerAssignment = {
  propUid: string;
  polarity: AnswerPolarity;
  confidence: number;
  debateRole?: string | null;
};

export type QualifyInput = {
  questionUid: string;
  questionType: QuestionType | string | null;
  answerExclusivity: AnswerExclusivity | string | null;
  assignments: AnswerAssignment[];
  /** Optional veto labels from quarantined Decisions (Session 3.1). */
  vetoLabels?: string[];
};

export type QualifyResult = {
  qualifies: boolean;
  reason: string;
  confidence: number;
  sides: { pro: string[]; con: string[] };
};

const PRO_POLICY = new Set<AnswerPolarity>(["FAVOR"]);
const CON_POLICY = new Set<AnswerPolarity>(["AGAINST"]);
const PRO_FACTUAL = new Set<AnswerPolarity>(["AFFIRMS"]);
const CON_FACTUAL = new Set<AnswerPolarity>(["DENIES"]);
/** Conditional stance: counts toward density, not a third qualifying side. */
const CONDITIONAL = new Set<AnswerPolarity>(["QUALIFY"]);

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

function hasVeto(vetoLabels: string[] | undefined): boolean {
  if (!vetoLabels?.length) return false;
  return vetoLabels.some((l) => {
    const v = l.toLowerCase();
    return v === "talking_past" || v === "orthogonal";
  });
}

/** Stable Controversy uid from Question uid. */
export function controversyUidFromQuestion(questionUid: string): string {
  const slug = questionUid.replace(/^cq:/, "").slice(0, 24);
  return `ctr_${slug}`;
}

export function evaluateQuestionControversy(input: QualifyInput): QualifyResult {
  const empty: QualifyResult = {
    qualifies: false,
    reason: "insufficient_assignments",
    confidence: 0,
    sides: { pro: [], con: [] },
  };

  if (hasVeto(input.vetoLabels)) {
    return { ...empty, reason: "veto" };
  }

  const theses = thesisAssignments(input.assignments, ESTABLISH_MIN_CONFIDENCE);
  if (theses.length < 2) {
    return empty;
  }

  const qType = normalizeType(input.questionType);
  if (qType === "definitional" || qType === "unknown") {
    return { ...empty, reason: "definitional_or_unknown" };
  }

  const exclusivity = normalizeExclusivity(input.answerExclusivity);

  if (qType === "policy") {
    const pro = theses.filter((a) => PRO_POLICY.has(a.polarity)).map((a) => a.propUid);
    const con = theses.filter((a) => CON_POLICY.has(a.polarity)).map((a) => a.propUid);
    const qualify = theses.filter((a) => CONDITIONAL.has(a.polarity)).map((a) => a.propUid);
    if (pro.length && con.length) {
      const conf = Math.min(
        ...theses
          .filter((a) => PRO_POLICY.has(a.polarity) || CON_POLICY.has(a.polarity))
          .map((a) => a.confidence)
      );
      return {
        qualifies: true,
        reason: "policy_favor_against",
        confidence: conf,
        sides: { pro: [...pro, ...qualify], con },
      };
    }
    return { ...empty, reason: "policy_single_side", sides: { pro: [...pro, ...qualify], con } };
  }

  if (qType === "factual") {
    const pro = theses.filter((a) => PRO_FACTUAL.has(a.polarity)).map((a) => a.propUid);
    const con = theses.filter((a) => CON_FACTUAL.has(a.polarity)).map((a) => a.propUid);
    const qualify = theses.filter((a) => CONDITIONAL.has(a.polarity)).map((a) => a.propUid);
    if (pro.length && con.length) {
      const conf = Math.min(
        ...theses
          .filter((a) => PRO_FACTUAL.has(a.polarity) || CON_FACTUAL.has(a.polarity))
          .map((a) => a.confidence)
      );
      return {
        qualifies: true,
        reason: "factual_affirms_denies",
        confidence: conf,
        sides: { pro: [...pro, ...qualify], con },
      };
    }
    return { ...empty, reason: "factual_single_side", sides: { pro: [...pro, ...qualify], con } };
  }

  if (qType === "causal") {
    const pro = theses.filter((a) => PRO_FACTUAL.has(a.polarity)).map((a) => a.propUid);
    const con = theses.filter((a) => CON_FACTUAL.has(a.polarity)).map((a) => a.propUid);
    if (pro.length && con.length) {
      const conf = Math.min(
        ...theses
          .filter((a) => PRO_FACTUAL.has(a.polarity) || CON_FACTUAL.has(a.polarity))
          .map((a) => a.confidence)
      );
      return {
        qualifies: true,
        reason:
          exclusivity === "compatible"
            ? "causal_competing_causes"
            : "causal_exclusive_incompatible",
        confidence: conf,
        sides: { pro, con },
      };
    }
    const affirms = theses.filter((a) => a.polarity === "AFFIRMS");
    if (exclusivity === "compatible" && affirms.length >= 2) {
      const unique = [...new Set(affirms.map((a) => a.propUid))];
      if (unique.length >= 2) {
        const conf = Math.min(...affirms.map((a) => a.confidence));
        return {
          qualifies: true,
          reason: "causal_competing_causes",
          confidence: conf,
          sides: {
            pro: unique.slice(0, 1),
            con: unique.slice(1),
          },
        };
      }
    }
    return { ...empty, reason: "causal_no_incompatibility", sides: { pro, con } };
  }

  return empty;
}

function normalizeType(raw: QuestionType | string | null): QuestionType | "unknown" {
  if (raw == null || raw === "") return "unknown";
  const v = String(raw).trim().toLowerCase();
  if (v === "policy" || v === "factual" || v === "causal" || v === "definitional") {
    return v;
  }
  return "unknown";
}

function normalizeExclusivity(raw: AnswerExclusivity | string | null): AnswerExclusivity {
  if (raw == null || raw === "") return "unknown";
  const v = String(raw).trim().toLowerCase();
  if (v === "exclusive" || v === "compatible" || v === "unknown") return v;
  return "unknown";
}
