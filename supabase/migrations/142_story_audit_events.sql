-- Append-only audit log for story record changes and admin actions.

CREATE TABLE IF NOT EXISTS public.story_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(story_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text
);

COMMENT ON TABLE public.story_audit_events IS
  'Append-only audit ledger for story field changes and admin/pipeline actions.';

CREATE INDEX IF NOT EXISTS idx_story_audit_events_story_occurred
  ON public.story_audit_events (story_id, occurred_at DESC);

ALTER TABLE public.story_audit_events ENABLE ROW LEVEL SECURITY;

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
DECLARE
  v_id uuid;
BEGIN
  IF p_story_id IS NULL THEN
    RAISE EXCEPTION 'story_id is required';
  END IF;

  IF p_event_type NOT IN ('field_change', 'admin_action', 'pipeline_step') THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;

  INSERT INTO public.story_audit_events (
    story_id,
    event_type,
    label,
    detail,
    meta,
    actor_id,
    source
  )
  VALUES (
    p_story_id,
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

COMMENT ON FUNCTION public.append_story_audit_event IS
  'Insert one story audit ledger row. Used by triggers, admin RPCs, and API routes.';

REVOKE ALL ON FUNCTION public.append_story_audit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_story_audit_event TO service_role;

CREATE OR REPLACE FUNCTION public.stories_log_audit_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.skip_story_audit_trigger', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.relevance_status IS DISTINCT FROM NEW.relevance_status THEN
    PERFORM public.append_story_audit_event(
      NEW.story_id,
      'field_change',
      'Qualification status changed',
      COALESCE(OLD.relevance_status, '—') || ' → ' || COALESCE(NEW.relevance_status, '—'),
      jsonb_build_object(
        'field', 'relevance_status',
        'old', OLD.relevance_status,
        'new', NEW.relevance_status
      ),
      NULL,
      'trigger:stories'
    );
  END IF;

  IF OLD.extraction_qa_status IS DISTINCT FROM NEW.extraction_qa_status THEN
    PERFORM public.append_story_audit_event(
      NEW.story_id,
      'field_change',
      'Extraction QA status changed',
      COALESCE(OLD.extraction_qa_status, '—') || ' → ' || COALESCE(NEW.extraction_qa_status, '—'),
      jsonb_build_object(
        'field', 'extraction_qa_status',
        'old', OLD.extraction_qa_status,
        'new', NEW.extraction_qa_status
      ),
      NULL,
      'trigger:stories'
    );
  END IF;

  IF OLD.relevance_score IS DISTINCT FROM NEW.relevance_score THEN
    PERFORM public.append_story_audit_event(
      NEW.story_id,
      'field_change',
      'Relevance score changed',
      COALESCE(OLD.relevance_score::text, '—') || ' → ' || COALESCE(NEW.relevance_score::text, '—'),
      jsonb_build_object(
        'field', 'relevance_score',
        'old', OLD.relevance_score,
        'new', NEW.relevance_score
      ),
      NULL,
      'trigger:stories'
    );
  END IF;

  IF OLD.merged_at IS DISTINCT FROM NEW.merged_at THEN
    PERFORM public.append_story_audit_event(
      NEW.story_id,
      'field_change',
      CASE
        WHEN NEW.merged_at IS NULL THEN 'Merge cleared'
        ELSE 'Story merged'
      END,
      CASE
        WHEN NEW.merged_at IS NULL THEN 'merged_at cleared'
        ELSE to_char(NEW.merged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC'
      END,
      jsonb_build_object('field', 'merged_at', 'old', OLD.merged_at, 'new', NEW.merged_at),
      NULL,
      'trigger:stories'
    );
  END IF;

  IF OLD.extraction_completed_at IS DISTINCT FROM NEW.extraction_completed_at THEN
    PERFORM public.append_story_audit_event(
      NEW.story_id,
      'field_change',
      CASE
        WHEN NEW.extraction_completed_at IS NULL THEN 'Extraction completion cleared'
        ELSE 'Extraction completed'
      END,
      NULL,
      jsonb_build_object(
        'field', 'extraction_completed_at',
        'old', OLD.extraction_completed_at,
        'new', NEW.extraction_completed_at
      ),
      NULL,
      'trigger:stories'
    );
  END IF;

  IF OLD.scrape_skipped IS DISTINCT FROM NEW.scrape_skipped THEN
    PERFORM public.append_story_audit_event(
      NEW.story_id,
      'field_change',
      'Scrape skipped flag changed',
      COALESCE(OLD.scrape_skipped::text, '—') || ' → ' || COALESCE(NEW.scrape_skipped::text, '—'),
      jsonb_build_object('field', 'scrape_skipped', 'old', OLD.scrape_skipped, 'new', NEW.scrape_skipped),
      NULL,
      'trigger:stories'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stories_log_audit_on_update ON public.stories;

CREATE TRIGGER stories_log_audit_on_update
  AFTER UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.stories_log_audit_on_update();
