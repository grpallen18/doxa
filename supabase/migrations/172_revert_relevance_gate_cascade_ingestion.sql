-- Relevance-gate revert: strict downstream guard with explicit blocker details (no cascade).

CREATE OR REPLACE FUNCTION public.describe_story_ingestion_revert_blockers(
  p_has_pending_review boolean,
  p_has_body boolean,
  p_has_clean boolean,
  p_chunk_count int,
  p_extracted_count int,
  p_positions_extracted_count int
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts text[] := ARRAY[]::text[];
BEGIN
  IF p_has_pending_review THEN
    v_parts := array_append(
      v_parts,
      'pending review (revert "Review pending stories" first)'
    );
  END IF;
  IF p_has_body THEN
    v_parts := array_append(
      v_parts,
      'scraped body in story_bodies (revert "Scrape story content" first)'
    );
  END IF;
  IF p_has_clean THEN
    v_parts := array_append(
      v_parts,
      'cleaned body text (revert "Clean scraped content" first)'
    );
  END IF;
  IF p_chunk_count > 0 THEN
    v_parts := array_append(
      v_parts,
      format('%s story chunk(s) (revert "Chunk story bodies" first)', p_chunk_count)
    );
  END IF;
  IF p_extracted_count > 0 THEN
    v_parts := array_append(
      v_parts,
      format(
        'claims extraction on %s chunk(s) (revert extract / validate / refine claims first)',
        p_extracted_count
      )
    );
  END IF;
  IF p_positions_extracted_count > 0 THEN
    v_parts := array_append(
      v_parts,
      format(
        'positions extraction on %s chunk(s) (revert extract / validate / refine positions first)',
        p_positions_extracted_count
      )
    );
  END IF;

  IF coalesce(array_length(v_parts, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN array_to_string(v_parts, '; ');
END;
$$;

COMMENT ON FUNCTION public.describe_story_ingestion_revert_blockers IS
  'Human-readable list of ingestion/extraction artifacts blocking revert of qualification or pending review.';

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
    'refine-chunk-claims',
    'extract-story-positions',
    'validate-chunk-positions',
    'refine-chunk-positions'
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
  v_has_pending_review boolean := false;
  v_ingestion_blockers text;
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
  v_latest_run_id uuid;
  v_latest_run_at timestamptz;
  v_rec record;
  v_prior_report jsonb;
  v_attempt_number int;
  v_status text;
  v_step_runs_deleted int := 0;
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

  IF p_step_id IN ('extract-story-claims', 'validate-chunk-claims', 'refine-chunk-claims') THEN
    IF v_claims_lane_locked OR v_shared_merge_qa_locked OR v_canonical_locked THEN
      RAISE EXCEPTION
        'Cannot revert: later merge or canonical steps have progress. Use Clear extraction first.';
    END IF;
  ELSIF p_step_id IN ('extract-story-positions', 'validate-chunk-positions', 'refine-chunk-positions') THEN
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
      'Cannot revert: chunk claims review has progress. Revert the latest review or refine step first.';
  END IF;

  IF v_chunk_positions_review_started
    AND p_step_id = ANY (v_pre_validate_positions)
  THEN
    RAISE EXCEPTION
      'Cannot revert: chunk positions review has progress. Revert the latest review or refine step first.';
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

  SELECT EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.story_id = p_story_id
      AND (
        s.pending_review_ran_at IS NOT NULL
        OR coalesce(s.relevance_tags, '{}'::text[]) @> array['unclear_after_review']::text[]
      )
  )
  INTO v_has_pending_review;

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

      v_ingestion_blockers := public.describe_story_ingestion_revert_blockers(
        v_has_pending_review,
        v_has_body,
        v_has_clean,
        v_chunk_count,
        v_extracted_count,
        v_positions_extracted_count
      );
      IF v_ingestion_blockers IS NOT NULL THEN
        RAISE EXCEPTION
          'Cannot revert qualification until downstream artifacts are cleared: %',
          v_ingestion_blockers;
      END IF;

      UPDATE public.stories
      SET
        relevance_ran_at = null,
        relevance_score = null,
        relevance_confidence = null,
        relevance_reason = null,
        relevance_tags = null,
        relevance_model = null,
        relevance_claimed_at = null
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
        v_ingestion_blockers := public.describe_story_ingestion_revert_blockers(
          false,
          v_has_body,
          v_has_clean,
          v_chunk_count,
          v_extracted_count,
          v_positions_extracted_count
        );
        RAISE EXCEPTION
          'Cannot revert pending review until downstream artifacts are cleared: %',
          v_ingestion_blockers;
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
        scraped_at = null,
        scrape_dispatched_at = null,
        scrape_skipped = false,
        scrape_fail_count = 0,
        scrape_skipped_at = null
      WHERE story_id = p_story_id;

    WHEN 'clean-scraped-content' THEN
      IF NOT v_has_clean THEN
        RAISE EXCEPTION 'Step not executed: clean-scraped-content';
      END IF;

      IF v_chunk_count > 0 OR v_extracted_count > 0 OR v_positions_extracted_count > 0 THEN
        RAISE EXCEPTION 'Cannot revert clean while chunk/extract output exists';
      END IF;

      UPDATE public.story_bodies
      SET
        content_clean = null,
        cleaned_at = null,
        cleaner_model = null
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

    WHEN 'refine-chunk-claims' THEN
      SELECT a.run_id, a.created_at
      INTO v_latest_run_id, v_latest_run_at
      FROM public.story_extraction_qa_artifacts a
      WHERE a.story_id = p_story_id
        AND a.stage = 'chunk_refine_claims'
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_latest_run_at IS NULL THEN
        RAISE EXCEPTION 'Step not executed: refine-chunk-claims';
      END IF;

      FOR v_rec IN
        SELECT a.id, a.chunk_index, a.input_snapshot
        FROM public.story_extraction_qa_artifacts a
        WHERE a.story_id = p_story_id
          AND a.stage = 'chunk_refine_claims'
          AND (
            (v_latest_run_id IS NOT NULL AND a.run_id = v_latest_run_id)
            OR (v_latest_run_id IS NULL AND a.created_at = v_latest_run_at)
          )
      LOOP
        UPDATE public.story_chunks sc
        SET
          extraction_json = v_rec.input_snapshot,
          extraction_qa_refinement_count = GREATEST(0, COALESCE(sc.extraction_qa_refinement_count, 0) - 1),
          extraction_qa_status = 'needs_refinement',
          extraction_qa_validated_at = null
        WHERE sc.story_id = p_story_id
          AND sc.chunk_index = v_rec.chunk_index;
        v_chunks_reset := v_chunks_reset + 1;
      END LOOP;

      DELETE FROM public.story_extraction_qa_artifacts
      WHERE story_id = p_story_id
        AND stage = 'chunk_refine_claims'
        AND (
          (v_latest_run_id IS NOT NULL AND run_id = v_latest_run_id)
          OR (v_latest_run_id IS NULL AND created_at = v_latest_run_at)
        );

    WHEN 'refine-chunk-positions' THEN
      SELECT a.run_id, a.created_at
      INTO v_latest_run_id, v_latest_run_at
      FROM public.story_extraction_qa_artifacts a
      WHERE a.story_id = p_story_id
        AND a.stage = 'chunk_refine_positions'
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_latest_run_at IS NULL THEN
        RAISE EXCEPTION 'Step not executed: refine-chunk-positions';
      END IF;

      FOR v_rec IN
        SELECT a.id, a.chunk_index, a.input_snapshot
        FROM public.story_extraction_qa_artifacts a
        WHERE a.story_id = p_story_id
          AND a.stage = 'chunk_refine_positions'
          AND (
            (v_latest_run_id IS NOT NULL AND a.run_id = v_latest_run_id)
            OR (v_latest_run_id IS NULL AND a.created_at = v_latest_run_at)
          )
      LOOP
        UPDATE public.story_chunks sc
        SET
          positions_extraction_json = v_rec.input_snapshot,
          positions_qa_refinement_count = GREATEST(0, COALESCE(sc.positions_qa_refinement_count, 0) - 1),
          positions_qa_status = 'needs_refinement',
          positions_qa_validated_at = null
        WHERE sc.story_id = p_story_id
          AND sc.chunk_index = v_rec.chunk_index;
        v_chunks_reset := v_chunks_reset + 1;
      END LOOP;

      DELETE FROM public.story_extraction_qa_artifacts
      WHERE story_id = p_story_id
        AND stage = 'chunk_refine_positions'
        AND (
          (v_latest_run_id IS NOT NULL AND run_id = v_latest_run_id)
          OR (v_latest_run_id IS NULL AND created_at = v_latest_run_at)
        );

    WHEN 'validate-chunk-claims' THEN
      SELECT a.run_id, a.created_at
      INTO v_latest_run_id, v_latest_run_at
      FROM public.story_extraction_qa_artifacts a
      WHERE a.story_id = p_story_id
        AND a.stage = 'chunk_review_claims'
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_latest_run_at IS NULL THEN
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
      ELSE
        FOR v_rec IN
          SELECT a.id, a.chunk_index, a.input_snapshot, a.report, a.created_at
          FROM public.story_extraction_qa_artifacts a
          WHERE a.story_id = p_story_id
            AND a.stage = 'chunk_review_claims'
            AND (
              (v_latest_run_id IS NOT NULL AND a.run_id = v_latest_run_id)
              OR (v_latest_run_id IS NULL AND a.created_at = v_latest_run_at)
            )
        LOOP
          SELECT a.report
          INTO v_prior_report
          FROM public.story_extraction_qa_artifacts a
          WHERE a.story_id = p_story_id
            AND a.stage = 'chunk_review_claims'
            AND a.chunk_index = v_rec.chunk_index
            AND a.created_at < v_rec.created_at
          ORDER BY a.created_at DESC
          LIMIT 1;

          IF v_prior_report IS NULL THEN
            UPDATE public.story_chunks sc
            SET
              extraction_json = COALESCE(v_rec.input_snapshot, sc.extraction_json),
              extraction_qa_status = 'pending',
              extraction_qa_review_report = null,
              extraction_qa_standardization_report = null,
              extraction_qa_validation_report = null,
              extraction_qa_validation_attempt_count = 0,
              extraction_qa_validated_at = null
            WHERE sc.story_id = p_story_id
              AND sc.chunk_index = v_rec.chunk_index;
          ELSE
            v_attempt_number := COALESCE((v_prior_report->>'attempt_number')::int, 1);
            v_status := public.revert_qa_status_from_review_report(v_prior_report, v_attempt_number);

            UPDATE public.story_chunks sc
            SET
              extraction_json = COALESCE(v_rec.input_snapshot, sc.extraction_json),
              extraction_qa_status = v_status,
              extraction_qa_review_report = v_prior_report,
              extraction_qa_validation_report = jsonb_build_object(
                'passes', v_status = 'passed',
                'recommended_status', v_status,
                'summary', v_prior_report->>'summary',
                'attempt_number', v_attempt_number,
                'deterministic_issues', COALESCE(v_prior_report->'deterministic_issues', '[]'::jsonb)
              ),
              extraction_qa_validation_attempt_count = v_attempt_number,
              extraction_qa_validated_at = CASE
                WHEN v_status IN ('passed', 'needs_human_review') THEN now()
                ELSE null
              END
            WHERE sc.story_id = p_story_id
              AND sc.chunk_index = v_rec.chunk_index;
          END IF;

          v_chunks_reset := v_chunks_reset + 1;
        END LOOP;

        DELETE FROM public.story_extraction_qa_artifacts
        WHERE story_id = p_story_id
          AND stage = 'chunk_review_claims'
          AND (
            (v_latest_run_id IS NOT NULL AND run_id = v_latest_run_id)
            OR (v_latest_run_id IS NULL AND created_at = v_latest_run_at)
          );
      END IF;

    WHEN 'validate-chunk-positions' THEN
      SELECT a.run_id, a.created_at
      INTO v_latest_run_id, v_latest_run_at
      FROM public.story_extraction_qa_artifacts a
      WHERE a.story_id = p_story_id
        AND a.stage = 'chunk_review_positions'
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_latest_run_at IS NULL THEN
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
        FOR v_rec IN
          SELECT a.id, a.chunk_index, a.input_snapshot, a.report, a.created_at
          FROM public.story_extraction_qa_artifacts a
          WHERE a.story_id = p_story_id
            AND a.stage = 'chunk_review_positions'
            AND (
              (v_latest_run_id IS NOT NULL AND a.run_id = v_latest_run_id)
              OR (v_latest_run_id IS NULL AND a.created_at = v_latest_run_at)
            )
        LOOP
          SELECT a.report
          INTO v_prior_report
          FROM public.story_extraction_qa_artifacts a
          WHERE a.story_id = p_story_id
            AND a.stage = 'chunk_review_positions'
            AND a.chunk_index = v_rec.chunk_index
            AND a.created_at < v_rec.created_at
          ORDER BY a.created_at DESC
          LIMIT 1;

          IF v_prior_report IS NULL THEN
            UPDATE public.story_chunks sc
            SET
              positions_extraction_json = COALESCE(v_rec.input_snapshot, sc.positions_extraction_json),
              positions_qa_status = 'pending',
              positions_qa_review_report = null,
              positions_qa_validation_report = null,
              positions_qa_validation_attempt_count = 0,
              positions_qa_validated_at = null
            WHERE sc.story_id = p_story_id
              AND sc.chunk_index = v_rec.chunk_index;
          ELSE
            v_attempt_number := COALESCE((v_prior_report->>'attempt_number')::int, 1);
            v_status := public.revert_qa_status_from_review_report(v_prior_report, v_attempt_number);

            UPDATE public.story_chunks sc
            SET
              positions_extraction_json = COALESCE(v_rec.input_snapshot, sc.positions_extraction_json),
              positions_qa_status = v_status,
              positions_qa_review_report = v_prior_report,
              positions_qa_validation_report = jsonb_build_object(
                'passes', v_status = 'passed',
                'recommended_status', v_status,
                'summary', v_prior_report->>'summary',
                'attempt_number', v_attempt_number,
                'deterministic_issues', COALESCE(v_prior_report->'deterministic_issues', '[]'::jsonb)
              ),
              positions_qa_validation_attempt_count = v_attempt_number,
              positions_qa_validated_at = CASE
                WHEN v_status IN ('passed', 'needs_human_review') THEN now()
                ELSE null
              END
            WHERE sc.story_id = p_story_id
              AND sc.chunk_index = v_rec.chunk_index;
          END IF;

          v_chunks_reset := v_chunks_reset + 1;
        END LOOP;

        DELETE FROM public.story_extraction_qa_artifacts
        WHERE story_id = p_story_id
          AND stage = 'chunk_review_positions'
          AND (
            (v_latest_run_id IS NOT NULL AND run_id = v_latest_run_id)
            OR (v_latest_run_id IS NULL AND created_at = v_latest_run_at)
          );
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported revert step: %', p_step_id;
  END CASE;

  DELETE FROM public.story_step_runs
  WHERE story_id = p_story_id
    AND step_id = p_step_id;
  GET DIAGNOSTICS v_step_runs_deleted = row_count;

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
    'chunks_reset', v_chunks_reset,
    'step_runs_deleted', v_step_runs_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.revert_qa_status_from_review_report(jsonb, int) IS
  'Derives chunk QA status when restoring a prior review report during stack revert.';

COMMENT ON FUNCTION public.revert_story_pipeline_step(uuid, text, uuid) IS
  'Reverts one pipeline step. Chunk QA lanes undo one review or refine pass at a time using qa artifacts.';
