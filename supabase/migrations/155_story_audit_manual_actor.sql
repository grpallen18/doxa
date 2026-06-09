-- Attribute story history to admin users for manual Run/Revert; keep Agent for cron/automation.

CREATE TABLE IF NOT EXISTS public.story_audit_actor_staging (
  story_id uuid PRIMARY KEY REFERENCES public.stories (story_id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.story_audit_actor_staging IS
  'Short-lived admin user attribution for story_history rows written during manual pipeline Run.';

ALTER TABLE public.story_audit_actor_staging ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.stage_story_audit_actor(
  p_story_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_story_id IS NULL OR p_actor_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.story_audit_actor_staging (story_id, actor_id, set_at)
  VALUES (p_story_id, p_actor_id, now())
  ON CONFLICT (story_id) DO UPDATE
  SET actor_id = EXCLUDED.actor_id, set_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_story_audit_actor(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_story_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.story_audit_actor_staging
  WHERE story_id = p_story_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_staged_story_audit_actor(p_story_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.actor_id
  FROM public.story_audit_actor_staging s
  WHERE s.story_id = p_story_id
    AND s.set_at >= now() - interval '30 minutes'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.stage_story_audit_actor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_story_audit_actor(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.clear_story_audit_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_story_audit_actor(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_staged_story_audit_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_staged_story_audit_actor(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.stories_log_audit_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_source text;
BEGIN
  IF tg_op <> 'UPDATE' OR public.audit_trigger_skipped() THEN
    RETURN NEW;
  END IF;

  v_actor_id := public.resolve_staged_story_audit_actor(NEW.story_id);
  v_source := CASE
    WHEN v_actor_id IS NOT NULL THEN 'trigger:stories:manual'
    ELSE 'trigger:stories'
  END;

  IF OLD.relevance_status IS DISTINCT FROM NEW.relevance_status THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Qualification status changed',
      COALESCE(OLD.relevance_status, '—') || ' → ' || COALESCE(NEW.relevance_status, '—'),
      jsonb_build_object('field', 'relevance_status', 'old', OLD.relevance_status, 'new', NEW.relevance_status),
      v_actor_id, v_source
    );
  END IF;

  IF OLD.extraction_qa_status IS DISTINCT FROM NEW.extraction_qa_status THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Extraction QA status changed',
      COALESCE(OLD.extraction_qa_status, '—') || ' → ' || COALESCE(NEW.extraction_qa_status, '—'),
      jsonb_build_object('field', 'extraction_qa_status', 'old', OLD.extraction_qa_status, 'new', NEW.extraction_qa_status),
      v_actor_id, v_source
    );
  END IF;

  IF OLD.relevance_score IS DISTINCT FROM NEW.relevance_score THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Relevance score changed',
      COALESCE(OLD.relevance_score::text, '—') || ' → ' || COALESCE(NEW.relevance_score::text, '—'),
      jsonb_build_object('field', 'relevance_score', 'old', OLD.relevance_score, 'new', NEW.relevance_score),
      v_actor_id, v_source
    );
  END IF;

  IF OLD.merged_at IS DISTINCT FROM NEW.merged_at THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change',
      CASE WHEN NEW.merged_at IS NULL THEN 'Merge cleared' ELSE 'Story merged' END,
      CASE WHEN NEW.merged_at IS NULL THEN 'merged_at cleared' ELSE to_char(NEW.merged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' END,
      jsonb_build_object('field', 'merged_at', 'old', OLD.merged_at, 'new', NEW.merged_at),
      v_actor_id, v_source
    );
  END IF;

  IF OLD.extraction_completed_at IS DISTINCT FROM NEW.extraction_completed_at THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change',
      CASE WHEN NEW.extraction_completed_at IS NULL THEN 'Extraction completion cleared' ELSE 'Extraction completed' END,
      NULL,
      jsonb_build_object('field', 'extraction_completed_at', 'old', OLD.extraction_completed_at, 'new', NEW.extraction_completed_at),
      v_actor_id, v_source
    );
  END IF;

  IF OLD.scrape_skipped IS DISTINCT FROM NEW.scrape_skipped THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Scrape skipped flag changed',
      COALESCE(OLD.scrape_skipped::text, '—') || ' → ' || COALESCE(NEW.scrape_skipped::text, '—'),
      jsonb_build_object('field', 'scrape_skipped', 'old', OLD.scrape_skipped, 'new', NEW.scrape_skipped),
      v_actor_id, v_source
    );
  END IF;

  RETURN NEW;
END;
$$;

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
  v_chunk_claims_review_started boolean := false;
  v_merge_or_canonical_progress boolean := false;
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

  IF v_chunk_claims_review_started
    AND p_step_id = ANY (v_pre_validate)
  THEN
    RAISE EXCEPTION
      'Cannot revert: chunk claims review has progress. Revert review chunk claims first.';
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
