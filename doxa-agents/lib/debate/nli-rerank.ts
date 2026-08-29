/**
 * Cheap lexical NLI fallback + optional LLM entailment check.
 */

import { CANDIDATE_STRONG_COSINE } from "./question-identity.ts";
import { chatJson, type LlmConfig } from "./llm.ts";
import { nliKeep } from "./candidate-bind.ts";

export type NliLabel = "entail" | "contradict" | "neutral";

export function lexicalNli(proposition: string, answerStatement: string): NliLabel {
  const a = proposition.toLowerCase();
  const b = answerStatement.toLowerCase();
  const neg = /\b(not|no|never|false|don't|dont|isn't|isnt)\b/;
  const aNeg = neg.test(a);
  const bNeg = neg.test(b);
  if (aNeg !== bNeg) return "contradict";
  const tokens = new Set(b.split(/\W+/).filter((w) => w.length > 3));
  let hit = 0;
  for (const t of tokens) if (a.includes(t)) hit += 1;
  if (tokens.size && hit / tokens.size >= 0.45) return "entail";
  return "neutral";
}

export async function llmNli(
  config: LlmConfig,
  proposition: string,
  answerStatement: string
): Promise<NliLabel> {
  const result = await chatJson<{ label?: string }>(
    config,
    `Classify whether the proposition entails, contradicts, or is neutral toward the answer statement.
Return ONLY JSON: {"label":"entail|contradict|neutral"}`,
    { proposition, answer_statement: answerStatement },
    { temperature: 0 }
  );
  const raw = String(result.parsed.label ?? "neutral").toLowerCase();
  if (raw.startsWith("entail")) return "entail";
  if (raw.startsWith("contradict")) return "contradict";
  return "neutral";
}

export function shouldBindCandidate(opts: {
  cosine: number;
  sharedEntity: boolean;
  nli: NliLabel;
  minCosine: number;
  strongCosine?: number;
}): boolean {
  const strong = opts.strongCosine ?? CANDIDATE_STRONG_COSINE;
  if (opts.cosine < opts.minCosine && !opts.sharedEntity) return false;
  if (opts.sharedEntity && opts.cosine >= opts.minCosine) return true;
  return nliKeep(opts.nli, opts.cosine, strong);
}
