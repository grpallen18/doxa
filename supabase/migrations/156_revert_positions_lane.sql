-- Positions lane revert: extract-story-positions and validate-chunk-positions.
-- Lane-specific merge guards so claims merge does not block positions extract revert.

CREATE OR REPLACE FUNCTION public.revert_story_pipeline_step(
  p_story_id uuid,
  p_step_id text,
  p_actor_id uuid DEFAULT NULL
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
    'validate-chunk-claims',
    'extract-story-positions',
    'validate-chunk-positions'
  ];
  v_pre_validate_claims text[] := array[
    'relevance-gate',
    'review-pending-stories',
    'scrape-story-content',
    'clean-scraped-content',
    'chunk-story-bodies',
    'extract-story-claims'
  ];
  v_pre_validate_positions text[] := array[
    'extract-story-positions'
  ];
  v_has_body boolean := false;
  v_has_clean boolean := false;
  v_chunk_count int := 0;
  v_extracted_count int := 0;
  v_positions_extracted_count int := 0;
  v_chunks_deleted int := 0;
  v_chunks_reset int := 0;
  v_chunk_claims_review_started boolean := false;
  v_chunk_positions_review_started boolean := false;
  v_claims_lane_locked boolean := false;
  v_positions_lane_locked boolean := false;
  v_shared_merge_qa_locked boolean := false;
  v_canonical_locked boolean := false;
BEGIN
  PERFORM set_config('app.skip_story_audit_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.stories s WHERE s.story_id = p_story_id) THEN
    RAISE EXCEPTION 'Story not found: %', p_story_id;
  END IF;

  IF p_step_id IS NULL OR NOT (p_step_id = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Unsupported revert step: %', COALESCE(p_step_id, '(null)');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.story_chunks sc
    WHERE sc.story_id = p_story_id
      AND sc.extraction_json IS NOT NULL
      AND COALESCE(sc.extraction_qa_status, 'pending') <> 'pending'
  )
  INTO v_chunk_claims_review_started;

  SELECT EXISTS (
    SELECT 1
    FROM public.story_chunks sc
    WHERE sc.story_id = p_story_id
      AND sc.positions_extraction_json IS NOT NULL
      AND COALESCE(sc.positions_qa_status, 'pending') <> 'pending'
  )
  INTO v_chunk_positions_review_started;

  v_claims_lane_locked :=
    EXISTS (SELECT 1 FROM public.story_claims sc WHERE sc.story_id = p_story_id)
    OR EXISTS (SELECT 1 FROM public.story_evidence se WHERE se.story_id = p_story_id);

  v_positions_lane_locked :=
    EXISTS (SELECT 1 FROM public.story_positions sp WHERE sp.story_id = p_story_id);

  v_shared_merge_qa_locked :=
    EXISTS (
      SELECT 1
      FROM public.stories s
      WHERE s.story_id = p_story_id
        AND s.extraction_qa_status IS NOT NULL
        AND s.extraction_qa_status NOT IN ('pending')
    );

  v_canonical_locked :=
    EXISTS (
      SELECT 1
      FROM public.story_claims sc
      WHERE sc.story_id = p_story_id
        AND sc.claim_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.story_events se
      WHERE se.story_id = p_story_id
        AND se.event_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.story_positions sp
      WHERE sp.story_id = p_story_id
        AND sp.canonical_position_id IS NOT NULL
    );

  IF p_step_id IN ('extract-story-claims', 'validate-chunk-claims') THEN
    IF v_claims_lane_locked OR v_shared_merge_qa_locked OR v_canonical_locked THEN
      RAISE EXCEPTION
        'Cannot revert: later merge or canonical steps have progress. Use Clear extraction first.';
    END IF;
  ELSIF p_step_id IN ('extract-story-positions', 'validate-chunk-positions') THEN
    IF v_positions_lane_locked OR v_shared_merge_qa_locked OR v_canonical_locked THEN
      RAISE EXCEPTION
        'Cannot revert: later merge or canonical steps have progress. Use Clear extraction first.';
    END IF;
  ELSE
    IF v_claims_lane_locked
      OR v_positions_lane_locked
      OR v_shared_merge_qa_locked
      OR v_canonical_locked
    THEN
      RAISE EXCEPTION
        'Cannot revert: later merge or canonical steps have progress. Use Clear extraction first.';
    END IF;
  END IF;

  IF v_chunk_claims_review_started
    AND p_step_id = ANY (v_pre_validate_claims)
  THEN
    RAISE EXCEPTION
      'Cannot revert: chunk claims review has progress. Revert review chunk claims first.';
  END IF;

  IF v_chunk_positions_review_started
    AND p_step_id = ANY (v_pre_validate_positions)
  THEN
    RAISE EXCEPTION
      'Cannot revert: chunk positions review has progress. Revert review chunk positions first.';
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
         count(*) FILTER (WHERE sc.extraction_json IS NOT NULL)::int,
         count(*) FILTER (WHERE sc.positions_extraction_json IS NOT NULL)::int
  INTO v_chunk_count, v_extracted_count, v_positions_extracted_count
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

      IF v_has_clean OR v_has_body OR v_chunk_count > 0 OR v_extracted_count > 0 OR v_positions_extracted_count > 0 THEN
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

      IF v_has_clean OR v_has_body OR v_chunk_count > 0 OR v_extracted_count > 0 OR v_positions_extracted_count > 0 THEN
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

      IF v_has_clean OR v_chunk_count > 0 OR v_extracted_count > 0 OR v_positions_extracted_count > 0 THEN
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

      IF v_chunk_count > 0 OR v_extracted_count > 0 OR v_positions_extracted_count > 0 THEN
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

      IF v_extracted_count > 0 OR v_positions_extracted_count > 0 THEN
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

    WHEN 'extract-story-positions' THEN
      IF v_positions_extracted_count = 0 THEN
        RAISE EXCEPTION 'Step not executed: extract-story-positions';
      END IF;

      UPDATE public.story_chunks
      SET
        positions_extraction_json = null,
        positions_extraction_completed_at = null,
        positions_qa_status = null,
        positions_qa_review_report = null,
        positions_qa_validation_report = null,
        positions_qa_refinement_count = 0,
        positions_qa_validation_attempt_count = 0,
        positions_qa_validated_at = null
      WHERE story_id = p_story_id;
      GET DIAGNOSTICS v_chunks_reset = row_count;

      DELETE FROM public.story_extraction_qa_artifacts
      WHERE story_id = p_story_id
        AND stage IN ('chunk_extract_positions');

    WHEN 'validate-chunk-claims' THEN
      IF NOT v_chunk_claims_review_started THEN
        RAISE EXCEPTION 'Step not executed: validate-chunk-claims';
      END IF;

      UPDATE public.story_chunks
      SET
        extraction_qa_status = 'pending',
        extraction_qa_review_report = null,
        extraction_qa_standardization_report = null,
        extraction_qa_validation_report = null,
        extraction_qa_refinement_count = 0,
        extraction_qa_validation_attempt_count = 0,
        extraction_qa_validated_at = null
      WHERE story_id = p_story_id
        AND extraction_json IS NOT NULL;
      GET DIAGNOSTICS v_chunks_reset = row_count;

      DELETE FROM public.story_extraction_qa_artifacts
      WHERE story_id = p_story_id
        AND stage IN (
          'chunk_review_claims',
          'chunk_refine_claims',
          'chunk_review',
          'chunk_refine',
          'chunk_validate_claims',
          'chunk_validate'
        );

    WHEN 'validate-chunk-positions' THEN
      IF NOT v_chunk_positions_review_started THEN
        RAISE EXCEPTION 'Step not executed: validate-chunk-positions';
      END IF;

      UPDATE public.story_chunks
      SET
        positions_qa_status = 'pending',
        positions_qa_review_report = null,
        positions_qa_validation_report = null,
        positions_qa_refinement_count = 0,
        positions_qa_validation_attempt_count = 0,
        positions_qa_validated_at = null
      WHERE story_id = p_story_id
        AND positions_extraction_json IS NOT NULL;
      GET DIAGNOSTICS v_chunks_reset = row_count;

      DELETE FROM public.story_extraction_qa_artifacts
      WHERE story_id = p_story_id
        AND stage IN (
          'chunk_review_positions',
          'chunk_refine_positions',
          'chunk_validate_positions'
        );

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
    p_actor_id,
    CASE
      WHEN p_actor_id IS NOT NULL THEN 'api:revert-step'
      ELSE 'rpc:revert_story_pipeline_step'
    END
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
