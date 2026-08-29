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

export function isBootstrapMode(
  questionCount: number,
  threshold = L3_BOOTSTRAP_QUESTION_THRESHOLD
): boolean {
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
}> {
  const questionCount = await countGraphQuestions(supabase);
  return { questionCount, bootstrap: isBootstrapMode(questionCount) };
}
