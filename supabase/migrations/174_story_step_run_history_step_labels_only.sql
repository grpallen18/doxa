-- Pipeline step audit: store step names only in story_history meta (no outcome/processed suffix).

CREATE OR REPLACE FUNCTION public.append_story_step_run(
  p_story_id uuid,
  p_step_id text,
  p_deploy_name text,
  p_outcome text,
  p_trigger text,
  p_pipeline_run_id uuid DEFAULT NULL,
  p_chunk_index smallint DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_prev_step_id text;
  v_step_label text;
  v_prev_label text;
  v_label text;
  v_processed int;
  v_source text;
BEGIN
  IF p_outcome NOT IN ('success', 'failure', 'looping', 'skipped', 'no_op') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;
  IF p_trigger NOT IN ('cron', 'admin', 'callback', 'internal') THEN
    RAISE EXCEPTION 'Invalid trigger: %', p_trigger;
  END IF;

  SELECT ssr.step_id
  INTO v_prev_step_id
  FROM public.story_step_runs ssr
  WHERE ssr.story_id = p_story_id
  ORDER BY ssr.occurred_at DESC, ssr.id DESC
  LIMIT 1;

  INSERT INTO public.story_step_runs (
    story_id,
    step_id,
    deploy_name,
    outcome,
    trigger,
    pipeline_run_id,
    chunk_index,
    actor_id,
    meta,
    error,
    ended_at
  )
  VALUES (
    p_story_id,
    p_step_id,
    p_deploy_name,
    p_outcome,
    p_trigger,
    p_pipeline_run_id,
    p_chunk_index,
    p_actor_id,
    COALESCE(p_meta, '{}'::jsonb),
    p_error,
    COALESCE(p_ended_at, now())
  )
  RETURNING id INTO v_id;

  v_step_label := initcap(replace(p_step_id, '-', ' '));
  v_prev_label := CASE
    WHEN v_prev_step_id IS NOT NULL THEN initcap(replace(v_prev_step_id, '-', ' '))
    ELSE NULL
  END;

  v_processed := nullif(trim(coalesce(p_meta->>'processed', '')), '')::int;

  v_label := CASE
    WHEN p_outcome = 'failure' THEN 'Pipeline step failed'
    WHEN p_outcome = 'skipped' THEN 'Pipeline step skipped'
    ELSE 'Pipeline step run'
  END;

  v_source := 'story_step_runs:' || p_trigger;

  PERFORM public.append_story_history(
    p_story_id,
    'pipeline_step',
    v_label,
    p_step_id,
    jsonb_build_object(
      'field', 'Pipeline step',
      'old', v_prev_label,
      'new', v_step_label,
      'step_id', p_step_id,
      'previous_step_id', v_prev_step_id,
      'deploy_name', p_deploy_name,
      'outcome', p_outcome,
      'processed', v_processed,
      'run_id', p_pipeline_run_id
    ),
    p_actor_id,
    v_source
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.append_story_step_run IS
  'Append one story-scoped pipeline step run row and mirror previous→current step labels to story_history.';
