export const DEFAULT_CHUNK_QA_MODEL = "gpt-5.4-nano-2026-03-17";

export function resolveChunkQaModel(
  env: Record<string, string | undefined> = Deno.env.toObject()
): string {
  return (
    env.OPENAI_MODEL_CHUNK_QA ??
    env.OPENAI_MODEL_EXTRACT ??
    env.OPENAI_MODEL ??
    DEFAULT_CHUNK_QA_MODEL
  );
}
