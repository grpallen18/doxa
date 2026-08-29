/** Bootstrap L3: mint from unbound clusters until the question registry is large enough. */

export const L3_BOOTSTRAP_QUESTION_THRESHOLD = 30;
export const UNBOUND_CLUSTER_MIN_SIZE = 2;

type CountClient = {
  from: (table: string) => {
    select: (
      columns: string,
      opts: { count: "exact"; head: boolean }
    ) => PromiseLike<{ count: number | null; error: { message: string } | null }>;
  };
};

function envGet(key: string): string {
  try {
    const deno = (globalThis as { Deno?: { env?: { get: (k: string) => string | undefined } } }).Deno;
    const fromDeno = deno?.env?.get?.(key);
    if (fromDeno) return fromDeno;
  } catch {
    /* not Deno */
  }
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return proc?.env?.[key] ?? "";
  } catch {
    return "";
  }
}

/** Explicit cutover: L3_BOOTSTRAP=false|0|off disables bootstrap regardless of question count. */
export function bootstrapOverrideFromEnv(): boolean | null {
  const raw = envGet("L3_BOOTSTRAP").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "on" || raw === "yes") return true;
  return null;
}

export function isBootstrapMode(
  questionCount: number,
  threshold = L3_BOOTSTRAP_QUESTION_THRESHOLD
): boolean {
  const override = bootstrapOverrideFromEnv();
  if (override != null) return override;
  return questionCount < threshold;
}

export async function countGraphQuestions(supabase: CountClient): Promise<number> {
  const { count, error } = await supabase
    .from("graph_questions")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function loadBootstrapState(supabase: CountClient): Promise<{
  questionCount: number;
  bootstrap: boolean;
  bootstrapOverride: boolean | null;
}> {
  const questionCount = await countGraphQuestions(supabase);
  const bootstrapOverride = bootstrapOverrideFromEnv();
  return {
    questionCount,
    bootstrap: isBootstrapMode(questionCount),
    bootstrapOverride,
  };
}
