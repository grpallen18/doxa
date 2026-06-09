import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CLAIMS_REVIEW_SCHEMA, POSITIONS_REVIEW_SCHEMA } from "./extraction-qa/openai-qa.ts";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  schema: Record<string, unknown>;
  schemaName: string;
  source: ActiveResponseSchema["source"];
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

const DEFAULT_SCHEMAS: Record<string, { schema: Record<string, unknown>; name: string }> = {
  "validate-chunk-claims": {
    schema: CLAIMS_REVIEW_SCHEMA as unknown as Record<string, unknown>,
    name: "doxa_chunk_claims_review",
  },
  "validate-chunk-positions": {
    schema: POSITIONS_REVIEW_SCHEMA as unknown as Record<string, unknown>,
    name: "doxa_chunk_positions_review",
  },
};

export type ActiveResponseSchema = {
  schema: Record<string, unknown>;
  schemaName: string;
  source: "db_override" | "code_default";
};

export async function loadActiveResponseSchema(
  supabase: SupabaseClient,
  stepId: string
): Promise<ActiveResponseSchema | null> {
  const cached = cache.get(stepId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      schema: cached.schema,
      schemaName: cached.schemaName,
      source: cached.source,
    };
  }

  const { data, error } = await supabase
    .from("agent_prompt_slots")
    .select("response_json_schema")
    .eq("step_id", stepId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load response schema for ${stepId}: ${error.message}`);
  }

  const override = data?.response_json_schema as Record<string, unknown> | null;
  if (override && typeof override === "object") {
    const entry: CacheEntry = {
      schema: override,
      schemaName: stepId.replace(/-/g, "_"),
      source: "db_override",
      fetchedAt: Date.now(),
    };
    cache.set(stepId, entry);
    return {
      schema: entry.schema,
      schemaName: entry.schemaName,
      source: entry.source,
    };
  }

  const fallback = DEFAULT_SCHEMAS[stepId];
  if (!fallback) return null;

  const entry: CacheEntry = {
    schema: fallback.schema,
    schemaName: fallback.name,
    source: "code_default",
    fetchedAt: Date.now(),
  };
  cache.set(stepId, entry);
  return {
    schema: entry.schema,
    schemaName: entry.schemaName,
    source: entry.source,
  };
}

export function clearResponseSchemaCache(stepId?: string) {
  if (stepId) cache.delete(stepId);
  else cache.clear();
}
