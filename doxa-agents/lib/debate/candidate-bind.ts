/**
 * Deterministic candidate binding helpers (no membership writes).
 */

export type BindHit = {
  propUid: string;
  questionUid: string;
  score: number;
  method: "entity" | "answer_knn" | "nli";
};

export function nliKeep(label: string, cosine: number, strongCosine: number): boolean {
  const v = label.trim().toLowerCase();
  if (v === "entail" || v === "entails" || v === "contradict" || v === "contradicts") return true;
  if (v === "neutral") return cosine >= strongCosine;
  return cosine >= strongCosine;
}

export function maxAnswerCosine(
  propEmb: number[],
  proEmb: number[] | null | undefined,
  conEmb: number[] | null | undefined,
  questionEmb: number[] | null | undefined,
  cosineFn: (a: number[], b: number[]) => number
): number {
  return Math.max(
    cosineFn(propEmb, proEmb ?? []),
    cosineFn(propEmb, conEmb ?? []),
    cosineFn(propEmb, questionEmb ?? [])
  );
}
