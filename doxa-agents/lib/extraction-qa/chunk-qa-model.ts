export const DEFAULT_CHUNK_QA_MODEL = "gpt-5.4-nano-2026-03-17";

/** Faster fallback when preview/main edge hits 150s idle timeout on slow models. */
export const FALLBACK_EXTRACT_MODEL = "gpt-4o-mini";

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

export function resolveExtractModel(
  env: Record<string, string | undefined> = Deno.env.toObject()
): string {
  // Do not fall back to OPENAI_MODEL — preview branches inherit parent secrets and may
  // point at a slow chat model. Extract uses OPENAI_MODEL_EXTRACT or gpt-4o-mini.
  return env.OPENAI_MODEL_EXTRACT?.trim() || FALLBACK_EXTRACT_MODEL;
}
