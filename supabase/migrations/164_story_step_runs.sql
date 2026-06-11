-- Story-scoped pipeline step run log (append-only) + latest rollup view.

CREATE TABLE IF NOT EXISTS public.story_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(story_id) ON DELETE CASCADE,
  step_id text NOT NULL,
  deploy_name text NOT NULL,
  outcome text NOT NULL CHECK (
    outcome IN ('success', 'failure', 'looping', 'skipped', 'no_op')
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  trigger text NOT NULL CHECK (
    trigger IN ('cron', 'admin', 'callback', 'internal')
  ),
  pipeline_run_id uuid REFERENCES public.pipeline_runs(run_id) ON DELETE SET NULL,
  chunk_index smallint,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

COMMENT ON TABLE public.story_step_runs IS
  'Append-only per-story pipeline step invocations with normalized outcomes.';

CREATE INDEX IF NOT EXISTS idx_story_step_runs_story_step_occurred
  ON public.story_step_runs (story_id, step_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_step_runs_step_occurred
  ON public.story_step_runs (step_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_step_runs_story_occurred
  ON public.story_step_runs (story_id, occurred_at DESC);

CREATE OR REPLACE VIEW public.story_step_latest AS
SELECT DISTINCT ON (story_id, step_id)
  id,
  story_id,
  step_id,
  deploy_name,
  outcome,
  occurred_at,
  ended_at,
  trigger,
  pipeline_run_id,
  chunk_index,
  actor_id,
  meta,
  error
FROM public.story_step_runs
ORDER BY story_id, step_id, occurred_at DESC;

COMMENT ON VIEW public.story_step_latest IS
  'Latest story_step_runs row per (story_id, step_id).';

ALTER TABLE public.story_step_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access story_step_runs"
  ON public.story_step_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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
BEGIN
  IF p_outcome NOT IN ('success', 'failure', 'looping', 'skipped', 'no_op') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;
  IF p_trigger NOT IN ('cron', 'admin', 'callback', 'internal') THEN
    RAISE EXCEPTION 'Invalid trigger: %', p_trigger;
  END IF;

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

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.append_story_step_run IS
  'Append one story-scoped pipeline step run row. Called from edge handlers and admin APIs.';

REVOKE ALL ON FUNCTION public.append_story_step_run FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_story_step_run TO service_role;

-- Extraction reset: drop step-run rows for post-ingestion pipeline steps.
CREATE OR REPLACE FUNCTION public.reset_story_extraction(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_ids uuid[];
  v_event_ids uuid[];
  v_position_ids uuid[];
  v_story_claims_deleted int := 0;
  v_story_evidence_deleted int := 0;
  v_story_positions_deleted int := 0;
  v_story_events_deleted int := 0;
  v_qa_artifacts_deleted int := 0;
  v_feedback_deleted int := 0;
  v_chunks_reset int := 0;
  v_orphan_claims_deleted int := 0;
  v_orphan_events_deleted int := 0;
  v_orphan_positions_deleted int := 0;
  v_step_runs_deleted int := 0;
  v_extraction_step_ids text[] := array[
    'chunk-story-bodies',
    'extract-story-claims',
    'validate-chunk-claims',
    'refine-chunk-claims',
    'extract-story-positions',
    'validate-chunk-positions',
    'refine-chunk-positions',
    'merge-story-positions',
    'merge-story-claims',
    'review-merged-extraction',
    'refine-merged-extraction',
    'validate-merged-extraction',
    'link-canonical-claims',
    'link-canonical-events',
    'link-canonical-positions',
    'update-stances'
  ];
BEGIN
  PERFORM set_config('app.skip_story_audit_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.stories s WHERE s.story_id = p_story_id) THEN
    RAISE EXCEPTION 'Story not found: %', p_story_id;
  END IF;

  SELECT coalesce(array_agg(distinct sc.claim_id), '{}')
  INTO v_claim_ids
  FROM public.story_claims sc
  WHERE sc.story_id = p_story_id
    AND sc.claim_id IS NOT NULL;

  SELECT coalesce(array_agg(distinct se.event_id), '{}')
  INTO v_event_ids
  FROM public.story_events se
  WHERE se.story_id = p_story_id
    AND se.event_id IS NOT NULL;

  SELECT coalesce(array_agg(distinct sp.canonical_position_id), '{}')
  INTO v_position_ids
  FROM public.story_positions sp
  WHERE sp.story_id = p_story_id
    AND sp.canonical_position_id IS NOT NULL;

  DELETE FROM public.story_claims WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_story_claims_deleted = row_count;

  DELETE FROM public.story_evidence WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_story_evidence_deleted = row_count;

  DELETE FROM public.story_positions WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_story_positions_deleted = row_count;

  DELETE FROM public.story_events WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_story_events_deleted = row_count;

  DELETE FROM public.story_extraction_qa_artifacts WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_qa_artifacts_deleted = row_count;

  DELETE FROM public.story_extraction_feedback WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_feedback_deleted = row_count;

  UPDATE public.story_chunks
  SET
    extraction_json = null,
    extraction_completed_at = null,
    extraction_qa_status = null,
    extraction_qa_review_report = null,
    extraction_qa_standardization_report = null,
    extraction_qa_validation_report = null,
    extraction_qa_refinement_count = 0,
    extraction_qa_validation_attempt_count = 0,
    extraction_qa_validated_at = null,
    positions_extraction_json = null,
    positions_qa_status = null,
    positions_qa_review_report = null,
    positions_qa_validation_report = null,
    positions_qa_refinement_count = 0,
    positions_qa_validation_attempt_count = 0,
    positions_qa_validated_at = null
  WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_chunks_reset = row_count;

  UPDATE public.stories
  SET
    merged_at = null,
    extraction_completed_at = null,
    extraction_skipped_empty = false,
    extraction_qa_status = null,
    extraction_qa_review_report = null,
    extraction_qa_validation_report = null,
    extraction_qa_refinement_count = 0,
    extraction_qa_validated_at = null
  WHERE story_id = p_story_id;

  DELETE FROM public.story_step_runs
  WHERE story_id = p_story_id
    AND step_id = ANY (v_extraction_step_ids);
  GET DIAGNOSTICS v_step_runs_deleted = row_count;

  IF coalesce(array_length(v_claim_ids, 1), 0) > 0 THEN
    DELETE FROM public.claims c
    WHERE c.claim_id = ANY (v_claim_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_claims sc WHERE sc.claim_id = c.claim_id
      );
    GET DIAGNOSTICS v_orphan_claims_deleted = row_count;
  END IF;

  IF coalesce(array_length(v_event_ids, 1), 0) > 0 THEN
    DELETE FROM public.events e
    WHERE e.event_id = ANY (v_event_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_events se WHERE se.event_id = e.event_id
      );
    GET DIAGNOSTICS v_orphan_events_deleted = row_count;
  END IF;

  IF coalesce(array_length(v_position_ids, 1), 0) > 0 THEN
    DELETE FROM public.canonical_positions cp
    WHERE cp.canonical_position_id = ANY (v_position_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_positions sp WHERE sp.canonical_position_id = cp.canonical_position_id
      );
    GET DIAGNOSTICS v_orphan_positions_deleted = row_count;
  END IF;

  PERFORM public.append_story_audit_event(
    p_story_id,
    'admin_action',
    'Extraction data cleared',
    NULL,
    jsonb_build_object(
      'story_claims_deleted', v_story_claims_deleted,
      'story_evidence_deleted', v_story_evidence_deleted,
      'story_positions_deleted', v_story_positions_deleted,
      'story_events_deleted', v_story_events_deleted,
      'qa_artifacts_deleted', v_qa_artifacts_deleted,
      'feedback_deleted', v_feedback_deleted,
      'chunks_reset', v_chunks_reset,
      'step_runs_deleted', v_step_runs_deleted,
      'orphan_claims_deleted', v_orphan_claims_deleted,
      'orphan_events_deleted', v_orphan_events_deleted,
      'orphan_positions_deleted', v_orphan_positions_deleted
    ),
    NULL,
    'rpc:reset_story_extraction'
  );

  PERFORM set_config('app.skip_story_audit_trigger', 'false', true);

  RETURN jsonb_build_object(
    'story_id', p_story_id,
    'story_claims_deleted', v_story_claims_deleted,
    'story_evidence_deleted', v_story_evidence_deleted,
    'story_positions_deleted', v_story_positions_deleted,
    'story_events_deleted', v_story_events_deleted,
    'qa_artifacts_deleted', v_qa_artifacts_deleted,
    'feedback_deleted', v_feedback_deleted,
    'chunks_reset', v_chunks_reset,
    'step_runs_deleted', v_step_runs_deleted,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted
  );
END;
$$;
