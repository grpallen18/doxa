-- Runtime JSON schema overrides synced from prompt OUTPUT examples (no deploy required).

ALTER TABLE public.agent_prompt_slots
  ADD COLUMN IF NOT EXISTS response_json_schema jsonb,
  ADD COLUMN IF NOT EXISTS response_schema_prompt_version_id uuid
    REFERENCES public.agent_prompt_versions(version_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_schema_updated_at timestamptz;

COMMENT ON COLUMN public.agent_prompt_slots.response_json_schema IS
  'OpenAI strict JSON schema for LLM response_format; overrides code default when set.';

ALTER TABLE public.admin_pipeline_actions
  DROP CONSTRAINT IF EXISTS admin_pipeline_actions_action_type_check;

ALTER TABLE public.admin_pipeline_actions
  ADD CONSTRAINT admin_pipeline_actions_action_type_check
  CHECK (
    action_type IN (
      'prompt_version_created',
      'prompt_version_activated',
      'prompt_version_rollback',
      'prompt_schema_synced'
    )
  );
