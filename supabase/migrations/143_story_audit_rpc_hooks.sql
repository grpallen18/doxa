-- Log admin RPC actions to story_audit_events (field-level changes use trigger unless skipped).

CREATE OR REPLACE FUNCTION public.revert_story_pipeline_step(
  p_story_id uuid,
  p_step_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := array[
    'relevance-gate',
    'review-pending-stories',
    'scrape-story-content',
    'clean-scraped-content',
    'chunk-story-bodies',
    'extract-story-claims',
    'validate-chunk-claims'
  ];
  v_pre_validate text[] := array[
    'relevance-gate',
    'review-pending-stories',
    'scrape-story-content',
    'clean-scraped-content',
    'chunk-story-bodies',
    'extract-story-claims'
  ];
  v_has_body boolean := false;
  v_has_clean boolean := false;
  v_chunk_count int := 0;
  v_extracted_count int := 0;
  v_chunks_deleted int := 0;
  v_chunks_reset int := 0;
  v_chunk_claims_validated boolean := false;
  v_merge_or_canonical_progress boolean := false;
BEGIN
  PERFORM set_config('app.skip_story_audit_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.stories s WHERE s.story_id = p_story_id) THEN
    RAISE EXCEPTION 'Story not found: %', p_story_id;
  END IF;

  IF p_step_id IS NULL OR NOT (p_step_id = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Unsupported revert step: %', COALESCE(p_step_id, '(null)');
  END IF;

  SELECT
    EXISTS (SELECT 1 FROM public.story_chunks sc WHERE sc.story_id = p_story_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.story_chunks sc
      WHERE sc.story_id = p_story_id
        AND (
          sc.extraction_json IS NULL
          OR COALESCE(sc.extraction_qa_status, 'pending') NOT IN ('passed', 'atoms_passed')
        )
    )
  INTO v_chunk_claims_validated;

  v_merge_or_canonical_progress :=
    EXISTS (SELECT 1 FROM public.story_claims sc WHERE sc.story_id = p_story_id)
    OR EXISTS (SELECT 1 FROM public.story_evidence se WHERE se.story_id = p_story_id)
    OR EXISTS (SELECT 1 FROM public.story_positions sp WHERE sp.story_id = p_story_id)
    OR EXISTS (SELECT 1 FROM public.story_events sev WHERE sev.story_id = p_story_id)
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.story_id = p_story_id
        AND (
          s.merged_at IS NOT NULL
          OR s.extraction_qa_status IS NOT NULL
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.story_claims sc
      WHERE sc.story_id = p_story_id
        AND sc.claim_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.story_events se
      WHERE se.story_id = p_story_id
        AND se.event_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.story_positions sp
      WHERE sp.story_id = p_story_id
        AND sp.canonical_position_id IS NOT NULL
    );

  IF v_merge_or_canonical_progress THEN
    RAISE EXCEPTION
      'Cannot revert: later merge or canonical steps have progress. Use Clear extraction first.';
  END IF;

  IF v_chunk_claims_validated
    AND p_step_id = ANY (v_pre_validate)
  THEN
    RAISE EXCEPTION
      'Cannot revert: chunk claims review is complete. Revert validate-chunk-claims first.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.story_bodies sb WHERE sb.story_id = p_story_id)
  INTO v_has_body;

  SELECT EXISTS (
    SELECT 1
    FROM public.story_bodies sb
    WHERE sb.story_id = p_story_id
      AND sb.content_clean IS NOT NULL
      AND length(trim(sb.content_clean)) > 0
  )
  INTO v_has_clean;

  SELECT count(*)::int,
         count(*) FILTER (WHERE sc.extraction_json IS NOT NULL)::int
  INTO v_chunk_count, v_extracted_count
  FROM public.story_chunks sc
  WHERE sc.story_id = p_story_id;

  CASE p_step_id
    WHEN 'relevance-gate' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.story_id = p_story_id
          AND s.relevance_ran_at IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Step not executed: relevance-gate';
      END IF;

      IF v_has_clean OR v_has_body OR v_chunk_count > 0 OR v_extracted_count > 0 THEN
        RAISE EXCEPTION 'Cannot revert qualification while later ingestion/extraction output exists';
      END IF;

      UPDATE public.stories
      SET
        relevance_ran_at = null,
        relevance_score = null,
        relevance_confidence = null,
        relevance_reason = null,
        relevance_tags = null,
        relevance_decision = null
      WHERE story_id = p_story_id;

    WHEN 'review-pending-stories' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.story_id = p_story_id
          AND s.pending_review_ran_at IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Step not executed: review-pending-stories';
      END IF;

      IF v_has_clean OR v_has_body OR v_chunk_count > 0 OR v_extracted_count > 0 THEN
        RAISE EXCEPTION 'Cannot revert pending review while later ingestion/extraction output exists';
      END IF;

      UPDATE public.stories
      SET
        pending_review_ran_at = null,
        relevance_tags = array_remove(COALESCE(relevance_tags, array[]::text[]), 'unclear_after_review')
      WHERE story_id = p_story_id;

    WHEN 'scrape-story-content' THEN
      IF NOT v_has_body THEN
        RAISE EXCEPTION 'Step not executed: scrape-story-content';
      END IF;

      IF v_has_clean OR v_chunk_count > 0 OR v_extracted_count > 0 THEN
        RAISE EXCEPTION 'Cannot revert scrape while clean/chunk/extract output exists';
      END IF;

      DELETE FROM public.story_bodies WHERE story_id = p_story_id;

      UPDATE public.stories
      SET
        scrape_status = 'pending',
        scrape_error = null,
        scraped_at = null
      WHERE story_id = p_story_id;

    WHEN 'clean-scraped-content' THEN
      IF NOT v_has_clean THEN
        RAISE EXCEPTION 'Step not executed: clean-scraped-content';
      END IF;

      IF v_chunk_count > 0 OR v_extracted_count > 0 THEN
        RAISE EXCEPTION 'Cannot revert clean while chunk/extract output exists';
      END IF;

      UPDATE public.story_bodies
      SET content_clean = null
      WHERE story_id = p_story_id;

      UPDATE public.stories
      SET clean_completed_at = null
      WHERE story_id = p_story_id;

    WHEN 'chunk-story-bodies' THEN
      IF v_chunk_count = 0 THEN
        RAISE EXCEPTION 'Step not executed: chunk-story-bodies';
      END IF;

      IF v_extracted_count > 0 THEN
        RAISE EXCEPTION 'Cannot revert chunk while extract output exists; revert extract first';
      END IF;

      DELETE FROM public.story_chunks WHERE story_id = p_story_id;
      GET DIAGNOSTICS v_chunks_deleted = row_count;

      UPDATE public.stories
      SET
        extraction_completed_at = null,
        extraction_skipped_empty = false
      WHERE story_id = p_story_id;

    WHEN 'extract-story-claims' THEN
      IF v_extracted_count = 0
        AND NOT EXISTS (
          SELECT 1 FROM public.stories s
          WHERE s.story_id = p_story_id
            AND s.extraction_completed_at IS NOT NULL
        )
      THEN
        RAISE EXCEPTION 'Step not executed: extract-story-claims';
      END IF;

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
        extraction_qa_validated_at = null
      WHERE story_id = p_story_id;
      GET DIAGNOSTICS v_chunks_reset = row_count;

      UPDATE public.stories
      SET
        extraction_completed_at = null,
        extraction_skipped_empty = false
      WHERE story_id = p_story_id;

    WHEN 'validate-chunk-claims' THEN
      IF NOT v_chunk_claims_validated THEN
        RAISE EXCEPTION 'Step not executed: validate-chunk-claims';
      END IF;

      UPDATE public.story_chunks
      SET
        extraction_qa_status = 'pending',
        extraction_qa_validation_report = null,
        extraction_qa_validated_at = null,
        extraction_qa_validation_attempt_count = 0
      WHERE story_id = p_story_id
        AND extraction_json IS NOT NULL;
      GET DIAGNOSTICS v_chunks_reset = row_count;

      DELETE FROM public.story_extraction_qa_artifacts
      WHERE story_id = p_story_id
        AND stage IN ('chunk_validate_claims', 'chunk_validate');

    ELSE
      RAISE EXCEPTION 'Unsupported revert step: %', p_step_id;
  END CASE;

  PERFORM public.append_story_audit_event(
    p_story_id,
    'admin_action',
    'Pipeline step reverted',
    p_step_id,
    jsonb_build_object(
      'step_id', p_step_id,
      'chunks_deleted', v_chunks_deleted,
      'chunks_reset', v_chunks_reset
    ),
    NULL,
    'rpc:revert_story_pipeline_step'
  );

  PERFORM set_config('app.skip_story_audit_trigger', 'false', true);

  RETURN jsonb_build_object(
    'story_id', p_story_id,
    'step_id', p_step_id,
    'chunks_deleted', v_chunks_deleted,
    'chunks_reset', v_chunks_reset
  );
END;
$$;

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
BEGIN
  PERFORM set_config('app.skip_story_audit_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.stories s WHERE s.story_id = p_story_id) THEN
    RAISE EXCEPTION 'Story not found: %', p_story_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sc.claim_id), '{}')
  INTO v_claim_ids
  FROM public.story_claims sc
  WHERE sc.story_id = p_story_id
    AND sc.claim_id IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT se.event_id), '{}')
  INTO v_event_ids
  FROM public.story_events se
  WHERE se.story_id = p_story_id
    AND se.event_id IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT sp.canonical_position_id), '{}')
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
    extraction_qa_validated_at = null
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

  IF COALESCE(array_length(v_claim_ids, 1), 0) > 0 THEN
    DELETE FROM public.claims c
    WHERE c.claim_id = ANY (v_claim_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_claims sc WHERE sc.claim_id = c.claim_id
      );
    GET DIAGNOSTICS v_orphan_claims_deleted = row_count;
  END IF;

  IF COALESCE(array_length(v_event_ids, 1), 0) > 0 THEN
    DELETE FROM public.events e
    WHERE e.event_id = ANY (v_event_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_events se WHERE se.event_id = e.event_id
      );
    GET DIAGNOSTICS v_orphan_events_deleted = row_count;
  END IF;

  IF COALESCE(array_length(v_position_ids, 1), 0) > 0 THEN
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
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_story_canonical_links(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_ids uuid[];
  v_event_ids uuid[];
  v_position_ids uuid[];
  v_shared_claim_ids uuid[] := '{}';
  v_shared_event_ids uuid[] := '{}';
  v_shared_position_ids uuid[] := '{}';
  v_claims_unlinked int := 0;
  v_events_unlinked int := 0;
  v_positions_unlinked int := 0;
  v_stances_cleared int := 0;
  v_orphan_claims_deleted int := 0;
  v_orphan_events_deleted int := 0;
  v_orphan_positions_deleted int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stories s WHERE s.story_id = p_story_id) THEN
    RAISE EXCEPTION 'Story not found: %', p_story_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sc.claim_id), '{}')
  INTO v_claim_ids
  FROM public.story_claims sc
  WHERE sc.story_id = p_story_id
    AND sc.claim_id IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT se.event_id), '{}')
  INTO v_event_ids
  FROM public.story_events se
  WHERE se.story_id = p_story_id
    AND se.event_id IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT sp.canonical_position_id), '{}')
  INTO v_position_ids
  FROM public.story_positions sp
  WHERE sp.story_id = p_story_id
    AND sp.canonical_position_id IS NOT NULL;

  IF COALESCE(array_length(v_claim_ids, 1), 0) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT sc.claim_id), '{}')
    INTO v_shared_claim_ids
    FROM public.story_claims sc
    WHERE sc.claim_id = ANY (v_claim_ids)
      AND sc.story_id <> p_story_id;
  END IF;

  IF COALESCE(array_length(v_event_ids, 1), 0) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT se.event_id), '{}')
    INTO v_shared_event_ids
    FROM public.story_events se
    WHERE se.event_id = ANY (v_event_ids)
      AND se.story_id <> p_story_id;
  END IF;

  IF COALESCE(array_length(v_position_ids, 1), 0) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT sp.canonical_position_id), '{}')
    INTO v_shared_position_ids
    FROM public.story_positions sp
    WHERE sp.canonical_position_id = ANY (v_position_ids)
      AND sp.story_id <> p_story_id;
  END IF;

  UPDATE public.story_claims
  SET claim_id = null, stance = null
  WHERE story_id = p_story_id
    AND (claim_id IS NOT NULL OR stance IS NOT NULL);
  GET DIAGNOSTICS v_claims_unlinked = row_count;
  v_stances_cleared := v_claims_unlinked;

  UPDATE public.story_events
  SET event_id = null
  WHERE story_id = p_story_id
    AND event_id IS NOT NULL;
  GET DIAGNOSTICS v_events_unlinked = row_count;

  UPDATE public.story_positions
  SET canonical_position_id = null
  WHERE story_id = p_story_id
    AND canonical_position_id IS NOT NULL;
  GET DIAGNOSTICS v_positions_unlinked = row_count;

  IF COALESCE(array_length(v_claim_ids, 1), 0) > 0 THEN
    DELETE FROM public.claims c
    WHERE c.claim_id = ANY (v_claim_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_claims sc WHERE sc.claim_id = c.claim_id
      );
    GET DIAGNOSTICS v_orphan_claims_deleted = row_count;
  END IF;

  IF COALESCE(array_length(v_event_ids, 1), 0) > 0 THEN
    DELETE FROM public.events e
    WHERE e.event_id = ANY (v_event_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.story_events se WHERE se.event_id = e.event_id
      );
    GET DIAGNOSTICS v_orphan_events_deleted = row_count;
  END IF;

  IF COALESCE(array_length(v_position_ids, 1), 0) > 0 THEN
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
    'Canonical links cleared',
    NULL,
    jsonb_build_object(
      'claims_unlinked', v_claims_unlinked,
      'events_unlinked', v_events_unlinked,
      'positions_unlinked', v_positions_unlinked,
      'stances_cleared', v_stances_cleared,
      'orphan_claims_deleted', v_orphan_claims_deleted,
      'orphan_events_deleted', v_orphan_events_deleted,
      'orphan_positions_deleted', v_orphan_positions_deleted
    ),
    NULL,
    'rpc:reset_story_canonical_links'
  );

  RETURN jsonb_build_object(
    'story_id', p_story_id,
    'claims_unlinked', v_claims_unlinked,
    'events_unlinked', v_events_unlinked,
    'positions_unlinked', v_positions_unlinked,
    'stances_cleared', v_stances_cleared,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted,
    'shared_claim_ids', to_jsonb(v_shared_claim_ids),
    'shared_event_ids', to_jsonb(v_shared_event_ids),
    'shared_position_ids', to_jsonb(v_shared_position_ids)
  );
END;
$$;
