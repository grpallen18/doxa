/**
 * Question (CQ) identity helpers for L3 Question-first path.
 */

export const QUESTION_SCHEMA_VERSION = "3.0.0-question";
export const QUESTION_UID_PREFIX = "cq:";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const SAME_MATCH_MIN_CONFIDENCE = 0.75;
export const TOP_K_QUESTIONS = 8;

export type QuestionType = "policy" | "factual" | "causal" | "definitional";
export type AnswerExclusivity = "exclusive" | "compatible" | "unknown";
export type QuestionMatchLabel = "same" | "adjacent" | "unrelated";

export type AnswerPolarity =
  | "FAVOR"
  | "AGAINST"
  | "QUALIFY"
  | "AFFIRMS"
  | "DENIES"
  | "UNCERTAIN"
  | "NONE";

export function normalizeQuestionText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/g, "?");
}

/** Deterministic Question uid from normalized interrogative text. */
export async function questionUidFromText(question: string): Promise<string> {
  const norm = normalizeQuestionText(question);
  const digest = await sha256Hex(norm);
  return `${QUESTION_UID_PREFIX}${digest.slice(0, 20)}`;
}

export function ensureQuestionMark(question: string): string {
  const t = question.trim();
  if (!t) return t;
  return t.endsWith("?") ? t : `${t}?`;
}

export function parseQuestionType(raw: unknown): QuestionType | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "policy" || v === "factual" || v === "causal" || v === "definitional") return v;
  return null;
}

export function parseExclusivity(raw: unknown): AnswerExclusivity | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "exclusive" || v === "compatible" || v === "unknown") return v;
  return null;
}

export function parsePolarity(raw: unknown): AnswerPolarity | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  const allowed: AnswerPolarity[] = [
    "FAVOR",
    "AGAINST",
    "QUALIFY",
    "AFFIRMS",
    "DENIES",
    "UNCERTAIN",
    "NONE",
  ];
  return allowed.includes(v as AnswerPolarity) ? (v as AnswerPolarity) : null;
}

export function parseMatchLabel(raw: unknown): QuestionMatchLabel | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "same" || v === "adjacent" || v === "unrelated") return v;
  return null;
}

/** Deterministic veto: exclusive primary-cause vs open multi-cause must stay adjacent. */
export function isPrimaryCauseNearMiss(a: string, b: string): boolean {
  const na = normalizeQuestionText(a);
  const nb = normalizeQuestionText(b);
  const primary = /\bprimary cause\b|\bmain cause\b|\bthe (primary|main) reason\b/;
  const openCause = /\bwhat caused\b|\bwhat contributed\b|\bcauses? of\b/;
  const aPrimary = primary.test(na);
  const bPrimary = primary.test(nb);
  const aOpen = openCause.test(na) && !aPrimary;
  const bOpen = openCause.test(nb) && !bPrimary;
  return (aPrimary && bOpen) || (bPrimary && aOpen);
}

/** Apply LLM label with hard near-miss vetoes. */
export function resolveMatchLabel(
  a: string,
  b: string,
  llmLabel: QuestionMatchLabel | null,
  confidence = 0.5
): { label: QuestionMatchLabel; confidence: number } {
  if (isPrimaryCauseNearMiss(a, b)) {
    return { label: "adjacent", confidence: Math.max(confidence, 0.85) };
  }
  return { label: llmLabel ?? "unrelated", confidence };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** OpenAI embeddings for Deno / Node (fetch). */
export async function embedTexts(
  apiKey: string,
  texts: string[],
  model = EMBEDDING_MODEL
): Promise<number[][]> {
  if (!texts.length) return [];
  const cleaned = texts.map((t) => (t.trim() ? t : " "));
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: cleaned }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
  };
  const byIndex = new Map((data.data ?? []).map((d) => [d.index, d.embedding]));
  return cleaned.map((_, i) => listOrEmpty(byIndex.get(i)));
}

function listOrEmpty(v: number[] | undefined): number[] {
  return Array.isArray(v) ? v : [];
}
