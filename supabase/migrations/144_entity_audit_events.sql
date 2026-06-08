-- Unified append-only audit ledger for stories, chunks, and canonical entities.

CREATE TABLE IF NOT EXISTS public.entity_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (
    entity_type IN ('story', 'story_chunk', 'claim', 'event', 'position')
  ),
  entity_id uuid,
  story_id uuid REFERENCES public.stories(story_id) ON DELETE CASCADE,
  chunk_index smallint,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  CONSTRAINT entity_audit_events_ref_chk CHECK (
    (
      entity_type = 'story'
      AND entity_id IS NOT NULL
      AND story_id IS NULL
      AND chunk_index IS NULL
    )
    OR (
      entity_type = 'story_chunk'
      AND story_id IS NOT NULL
      AND chunk_index IS NOT NULL
    )
    OR (
      entity_type IN ('claim', 'event', 'position')
      AND entity_id IS NOT NULL
      AND story_id IS NULL
      AND chunk_index IS NULL
    )
  )
);

COMMENT ON TABLE public.entity_audit_events IS
  'Append-only audit ledger for story, chunk, and canonical entity changes.';

CREATE INDEX IF NOT EXISTS idx_entity_audit_entity_occurred
  ON public.entity_audit_events (entity_type, entity_id, occurred_at DESC)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_audit_story_occurred
  ON public.entity_audit_events (story_id, occurred_at DESC)
  WHERE story_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_audit_chunk_occurred
  ON public.entity_audit_events (story_id, chunk_index, occurred_at DESC)
  WHERE entity_type = 'story_chunk';

ALTER TABLE public.entity_audit_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.story_audit_events') IS NOT NULL THEN
    INSERT INTO public.entity_audit_events (
      entity_type,
      entity_id,
      occurred_at,
      event_type,
      label,
      detail,
      meta,
      actor_id,
      source
    )
    SELECT
      'story',
      story_id,
      occurred_at,
      event_type,
      label,
      detail,
      meta,
      actor_id,
      source
    FROM public.story_audit_events;

    DROP TABLE public.story_audit_events;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.audit_trigger_skipped()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(current_setting('app.skip_story_audit_trigger', true), '') = 'true'
    OR COALESCE(current_setting('app.skip_audit_trigger', true), '') = 'true';
$$;

CREATE OR REPLACE FUNCTION public.append_entity_audit_event(
  p_entity_type text,
  p_entity_id uuid,
  p_story_id uuid,
  p_chunk_index smallint,
  p_event_type text,
  p_label text,
  p_detail text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_actor_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_entity_type NOT IN ('story', 'story_chunk', 'claim', 'event', 'position') THEN
    RAISE EXCEPTION 'Invalid entity_type: %', p_entity_type;
  END IF;

  IF p_event_type NOT IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted') THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;

  IF p_entity_type = 'story' AND p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id is required for story audit events';
  END IF;

  IF p_entity_type = 'story_chunk' AND (p_story_id IS NULL OR p_chunk_index IS NULL) THEN
    RAISE EXCEPTION 'story_id and chunk_index are required for story_chunk audit events';
  END IF;

  IF p_entity_type IN ('claim', 'event', 'position') AND p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id is required for % audit events', p_entity_type;
  END IF;

  INSERT INTO public.entity_audit_events (
    entity_type,
    entity_id,
    story_id,
    chunk_index,
    event_type,
    label,
    detail,
    meta,
    actor_id,
    source
  )
  VALUES (
    p_entity_type,
    p_entity_id,
    p_story_id,
    p_chunk_index,
    p_event_type,
    p_label,
    p_detail,
    COALESCE(p_meta, '{}'::jsonb),
    p_actor_id,
    p_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_story_audit_event(
  p_story_id uuid,
  p_event_type text,
  p_label text,
  p_detail text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_actor_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.append_entity_audit_event(
    'story',
    p_story_id,
    NULL,
    NULL,
    p_event_type,
    p_label,
    p_detail,
    p_meta,
    p_actor_id,
    p_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_entity_audit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_entity_audit_event TO service_role;

REVOKE ALL ON FUNCTION public.append_story_audit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_story_audit_event TO service_role;

CREATE OR REPLACE FUNCTION public.stories_log_audit_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op <> 'UPDATE' OR public.audit_trigger_skipped() THEN
    RETURN NEW;
  END IF;

  IF OLD.relevance_status IS DISTINCT FROM NEW.relevance_status THEN
    PERFORM public.append_entity_audit_event(
      'story', NEW.story_id, NULL, NULL,
      'field_change', 'Qualification status changed',
      COALESCE(OLD.relevance_status, '—') || ' → ' || COALESCE(NEW.relevance_status, '—'),
      jsonb_build_object('field', 'relevance_status', 'old', OLD.relevance_status, 'new', NEW.relevance_status),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.extraction_qa_status IS DISTINCT FROM NEW.extraction_qa_status THEN
    PERFORM public.append_entity_audit_event(
      'story', NEW.story_id, NULL, NULL,
      'field_change', 'Extraction QA status changed',
      COALESCE(OLD.extraction_qa_status, '—') || ' → ' || COALESCE(NEW.extraction_qa_status, '—'),
      jsonb_build_object('field', 'extraction_qa_status', 'old', OLD.extraction_qa_status, 'new', NEW.extraction_qa_status),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.relevance_score IS DISTINCT FROM NEW.relevance_score THEN
    PERFORM public.append_entity_audit_event(
      'story', NEW.story_id, NULL, NULL,
      'field_change', 'Relevance score changed',
      COALESCE(OLD.relevance_score::text, '—') || ' → ' || COALESCE(NEW.relevance_score::text, '—'),
      jsonb_build_object('field', 'relevance_score', 'old', OLD.relevance_score, 'new', NEW.relevance_score),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.merged_at IS DISTINCT FROM NEW.merged_at THEN
    PERFORM public.append_entity_audit_event(
      'story', NEW.story_id, NULL, NULL,
      'field_change',
      CASE WHEN NEW.merged_at IS NULL THEN 'Merge cleared' ELSE 'Story merged' END,
      CASE WHEN NEW.merged_at IS NULL THEN 'merged_at cleared' ELSE to_char(NEW.merged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' END,
      jsonb_build_object('field', 'merged_at', 'old', OLD.merged_at, 'new', NEW.merged_at),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.extraction_completed_at IS DISTINCT FROM NEW.extraction_completed_at THEN
    PERFORM public.append_entity_audit_event(
      'story', NEW.story_id, NULL, NULL,
      'field_change',
      CASE WHEN NEW.extraction_completed_at IS NULL THEN 'Extraction completion cleared' ELSE 'Extraction completed' END,
      NULL,
      jsonb_build_object('field', 'extraction_completed_at', 'old', OLD.extraction_completed_at, 'new', NEW.extraction_completed_at),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.scrape_skipped IS DISTINCT FROM NEW.scrape_skipped THEN
    PERFORM public.append_entity_audit_event(
      'story', NEW.story_id, NULL, NULL,
      'field_change', 'Scrape skipped flag changed',
      COALESCE(OLD.scrape_skipped::text, '—') || ' → ' || COALESCE(NEW.scrape_skipped::text, '—'),
      jsonb_build_object('field', 'scrape_skipped', 'old', OLD.scrape_skipped, 'new', NEW.scrape_skipped),
      NULL, 'trigger:stories'
    );
  END IF;

  RETURN NEW;
END;
$$;
