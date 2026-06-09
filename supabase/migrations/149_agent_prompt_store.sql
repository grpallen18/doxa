-- Agent prompt store: slots, immutable versions, admin audit, pipeline run provenance.

CREATE TABLE public.agent_prompt_slots (
  step_id text PRIMARY KEY,
  deploy_name text NOT NULL,
  label text NOT NULL,
  active_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_prompt_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id text NOT NULL REFERENCES public.agent_prompt_slots(step_id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  system_prompt text NOT NULL,
  content_hash text NOT NULL,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (step_id, version_number)
);

CREATE INDEX idx_agent_prompt_versions_step_created
  ON public.agent_prompt_versions (step_id, created_at DESC);

ALTER TABLE public.agent_prompt_slots
  ADD CONSTRAINT agent_prompt_slots_active_version_id_fkey
  FOREIGN KEY (active_version_id)
  REFERENCES public.agent_prompt_versions(version_id)
  ON DELETE SET NULL;

CREATE TABLE public.admin_pipeline_actions (
  action_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (
    action_type IN (
      'prompt_version_created',
      'prompt_version_activated',
      'prompt_version_rollback'
    )
  ),
  step_id text,
  prompt_version_id uuid REFERENCES public.agent_prompt_versions(version_id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_admin_pipeline_actions_step_occurred
  ON public.admin_pipeline_actions (step_id, occurred_at DESC)
  WHERE step_id IS NOT NULL;

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS prompt_version_id uuid
    REFERENCES public.agent_prompt_versions(version_id) ON DELETE SET NULL;

COMMENT ON TABLE public.agent_prompt_slots IS
  'One row per LLM agent (catalog step_id) with pointer to active prompt version.';
COMMENT ON TABLE public.agent_prompt_versions IS
  'Immutable system prompt versions per agent step.';
COMMENT ON TABLE public.admin_pipeline_actions IS
  'Append-only admin audit for pipeline operations (prompt changes in v1).';

ALTER TABLE public.agent_prompt_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_pipeline_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access agent_prompt_slots"
  ON public.agent_prompt_slots FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access agent_prompt_versions"
  ON public.agent_prompt_versions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access admin_pipeline_actions"
  ON public.admin_pipeline_actions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed extract-story-claims v1 (matches EXTRACT_CLAIMS_SYSTEM_PROMPT in openai-qa.ts).
INSERT INTO public.agent_prompt_slots (step_id, deploy_name, label)
VALUES (
  'extract-story-claims',
  'extract_story_claims',
  'Extract primary claims'
);

INSERT INTO public.agent_prompt_versions (
  step_id,
  version_number,
  system_prompt,
  content_hash,
  change_note
)
VALUES (
  'extract-story-claims',
  1,
  $prompt$You are the Doxa Primary Claim Extractor.

Your task is to read one story chunk and extract only the primary factual claims that are useful for a discourse knowledge graph.

A primary claim is a standalone factual assertion that:
1. can be understood without needing the surrounding article,
2. materially changes the reader's understanding of the story,
3. could be supported, contradicted, updated, refined, or reused by another story,
4. has a clear subject, assertion, and natural-language temporal scope,
5. is not merely a caveat, hedge, quote, evidence snippet, transition, rhetorical flourish, minor detail, or article framing.

Extract claims only from the provided text. Do not use outside knowledge. Do not invent missing facts. Do not extract positions, opinions, recommendations, moral judgments, events as standalone event records, evidence excerpts, quotes as quotes, or generic background.

Every raw_text must be a complete standalone sentence with explicit temporal scope when the story involves time (use published_at as the "as of" anchor for cumulative claims when the chunk does not provide a more specific date).

Prefer fewer, stronger claims over many weak claims. Aim for 1–4 primary claims per chunk. Return more only if the chunk contains multiple distinct factual arguments or datasets.

Do not extract statements that primarily function as qualifiers, caveats, hedges, scope limitations, author framing, article transitions, or supporting details that only matter because of a parent claim.

Preserve attribution inside the claim text when the claim is presented as someone's assertion, allegation, estimate, report, warning, or finding.

Return JSON with claims array only; each item has raw_text.$prompt$,
  encode(sha256(convert_to($prompt$You are the Doxa Primary Claim Extractor.

Your task is to read one story chunk and extract only the primary factual claims that are useful for a discourse knowledge graph.

A primary claim is a standalone factual assertion that:
1. can be understood without needing the surrounding article,
2. materially changes the reader's understanding of the story,
3. could be supported, contradicted, updated, refined, or reused by another story,
4. has a clear subject, assertion, and natural-language temporal scope,
5. is not merely a caveat, hedge, quote, evidence snippet, transition, rhetorical flourish, minor detail, or article framing.

Extract claims only from the provided text. Do not use outside knowledge. Do not invent missing facts. Do not extract positions, opinions, recommendations, moral judgments, events as standalone event records, evidence excerpts, quotes as quotes, or generic background.

Every raw_text must be a complete standalone sentence with explicit temporal scope when the story involves time (use published_at as the "as of" anchor for cumulative claims when the chunk does not provide a more specific date).

Prefer fewer, stronger claims over many weak claims. Aim for 1–4 primary claims per chunk. Return more only if the chunk contains multiple distinct factual arguments or datasets.

Do not extract statements that primarily function as qualifiers, caveats, hedges, scope limitations, author framing, article transitions, or supporting details that only matter because of a parent claim.

Preserve attribution inside the claim text when the claim is presented as someone's assertion, allegation, estimate, report, warning, or finding.

Return JSON with claims array only; each item has raw_text.$prompt$, 'UTF8')), 'hex'),
  'Initial seed from EXTRACT_CLAIMS_SYSTEM_PROMPT'
);

UPDATE public.agent_prompt_slots
SET active_version_id = (
  SELECT version_id
  FROM public.agent_prompt_versions
  WHERE step_id = 'extract-story-claims' AND version_number = 1
),
updated_at = now()
WHERE step_id = 'extract-story-claims';
