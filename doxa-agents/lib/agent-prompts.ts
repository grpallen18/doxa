import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const CACHE_TTL_MS = 60_000;

export type ActiveAgentPrompt = {
  versionId: string;
  versionNumber: number;
  stepId: string;
  systemPrompt: string;
};

type CacheEntry = {
  prompt: ActiveAgentPrompt;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(stepId: string): string {
  return `step:${stepId}`;
}

async function fetchActivePrompt(
  supabase: SupabaseClient,
  stepId: string
): Promise<ActiveAgentPrompt> {
  const { data: slot, error: slotError } = await supabase
    .from("agent_prompt_slots")
    .select("step_id, active_version_id")
    .eq("step_id", stepId)
    .maybeSingle();

  if (slotError) {
    throw new Error(`Failed to load prompt slot for ${stepId}: ${slotError.message}`);
  }
  if (!slot) {
    throw new Error(`Prompt not configured for step ${stepId}`);
  }
  if (!slot.active_version_id) {
    throw new Error(`No active prompt version for step ${stepId}`);
  }

  const { data: version, error: versionError } = await supabase
    .from("agent_prompt_versions")
    .select("version_id, version_number, system_prompt")
    .eq("version_id", slot.active_version_id)
    .single();

  if (versionError || !version) {
    throw new Error(`Active prompt version missing for step ${stepId}`);
  }

  return {
    versionId: version.version_id as string,
    versionNumber: version.version_number as number,
    stepId: slot.step_id as string,
    systemPrompt: version.system_prompt as string,
  };
}

export async function loadActivePrompt(
  supabase: SupabaseClient,
  stepId: string
): Promise<ActiveAgentPrompt> {
  const key = cacheKey(stepId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.prompt;
  }

  const prompt = await fetchActivePrompt(supabase, stepId);
  cache.set(key, { prompt, fetchedAt: Date.now() });
  return prompt;
}

export async function loadActivePromptByDeploy(
  supabase: SupabaseClient,
  deployName: string
): Promise<ActiveAgentPrompt> {
  const { data: slot, error } = await supabase
    .from("agent_prompt_slots")
    .select("step_id")
    .eq("deploy_name", deployName)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load prompt slot for deploy ${deployName}: ${error.message}`);
  }
  if (!slot?.step_id) {
    throw new Error(`Prompt not configured for deploy ${deployName}`);
  }

  return loadActivePrompt(supabase, slot.step_id as string);
}
