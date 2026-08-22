/**
 * Cheap debate-role routing from existing speechAct + HAS_ROLE signals.
 * No LLM — used to decide who may found a Question.
 */

export type DebateRole = "thesis" | "premise" | "background";

const THESIS_SPEECH = new Set([
  "prescription",
  "judgment",
  "allegation",
  "prediction",
]);

const THESIS_ROLES = new Set([
  "conclusion",
  "objection",
  "rebuttal",
  "prediction",
]);

const PREMISE_ROLES = new Set(["premise", "qualifier", "assumption"]);

export function resolveDebateRole(input: {
  speechActs?: string[] | string | null;
  hasRoles?: string[] | string | null;
}): DebateRole {
  const acts = toList(input.speechActs).map((s) => s.toLowerCase());
  const roles = toList(input.hasRoles).map((s) => s.toLowerCase());

  // Definitions are not Controversy theses (Dispute path later).
  if (acts.includes("definition") && !roles.some((r) => THESIS_ROLES.has(r))) {
    return "background";
  }

  // Bare interrogative utterances are CQ text candidates, not thesis sides.
  if (acts.length === 1 && acts[0] === "question" && roles.length === 0) {
    return "background";
  }

  if (acts.some((a) => THESIS_SPEECH.has(a)) || roles.some((r) => THESIS_ROLES.has(r))) {
    return "thesis";
  }

  if (acts.includes("assertion") || roles.some((r) => PREMISE_ROLES.has(r))) {
    return "premise";
  }

  return "background";
}

function toList(raw: string[] | string | null | undefined): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((s) => String(s).split("|"))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return String(raw)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}
