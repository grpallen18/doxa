-- reset_story_extraction: clear claim versions before QA artifacts.

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
  v_claim_versions_deleted int := 0;
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

  UPDATE public.story_chunks
  SET active_claim_version_id = null
  WHERE story_id = p_story_id;

  DELETE FROM public.chunk_claim_versions WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_claim_versions_deleted = row_count;

  DELETE FROM public.story_extraction_qa_artifacts WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_qa_artifacts_deleted = row_count;

  DELETE FROM public.story_extraction_feedback WHERE story_id = p_story_id;
  GET DIAGNOSTICS v_feedback_deleted = row_count;

  UPDATE public.story_chunks
  SET
    extraction_json = null,
    active_claim_version_id = null,
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
    DELETE FROM public.positions p
    WHERE p.position_id = ANY (v_position_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_positions sp WHERE sp.canonical_position_id = p.position_id
      );
    GET DIAGNOSTICS v_orphan_positions_deleted = row_count;
  END IF;

  PERFORM public.append_story_audit_event(
    p_story_id,
    'admin_action',
    'Extraction data reset',
    'reset_story_extraction',
    jsonb_build_object(
      'story_claims_deleted', v_story_claims_deleted,
      'story_evidence_deleted', v_story_evidence_deleted,
      'story_positions_deleted', v_story_positions_deleted,
      'story_events_deleted', v_story_events_deleted,
      'qa_artifacts_deleted', v_qa_artifacts_deleted,
      'feedback_deleted', v_feedback_deleted,
      'chunks_reset', v_chunks_reset,
      'claim_versions_deleted', v_claim_versions_deleted,
      'orphan_claims_deleted', v_orphan_claims_deleted,
      'orphan_events_deleted', v_orphan_events_deleted,
      'orphan_positions_deleted', v_orphan_positions_deleted,
      'step_runs_deleted', v_step_runs_deleted
    ),
    null,
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
    'claim_versions_deleted', v_claim_versions_deleted,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted,
    'step_runs_deleted', v_step_runs_deleted
  );
END;
$$;
