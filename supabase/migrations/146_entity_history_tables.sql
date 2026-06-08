-- Split unified entity_audit_events into per-entity *_history tables.

CREATE TABLE IF NOT EXISTS public.story_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(story_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text
);

CREATE TABLE IF NOT EXISTS public.story_chunks_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(story_id) ON DELETE CASCADE,
  chunk_index smallint NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text
);

CREATE TABLE IF NOT EXISTS public.claims_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text
);

CREATE TABLE IF NOT EXISTS public.events_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text
);

CREATE TABLE IF NOT EXISTS public.positions_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_position_id uuid NOT NULL REFERENCES public.canonical_positions(canonical_position_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
    event_type IN ('field_change', 'admin_action', 'pipeline_step', 'created', 'deleted')
  ),
  label text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text
);

COMMENT ON TABLE public.story_history IS 'Append-only history for story record changes.';
COMMENT ON TABLE public.story_chunks_history IS 'Append-only history for story chunk changes.';
COMMENT ON TABLE public.claims_history IS 'Append-only history for canonical claim changes.';
COMMENT ON TABLE public.events_history IS 'Append-only history for canonical event changes.';
COMMENT ON TABLE public.positions_history IS 'Append-only history for canonical position changes.';

CREATE INDEX IF NOT EXISTS idx_story_history_story_occurred
  ON public.story_history (story_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_chunks_history_chunk_occurred
  ON public.story_chunks_history (story_id, chunk_index, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_claims_history_claim_occurred
  ON public.claims_history (claim_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_history_event_occurred
  ON public.events_history (event_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_positions_history_position_occurred
  ON public.positions_history (canonical_position_id, occurred_at DESC);

ALTER TABLE public.story_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_chunks_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.entity_audit_events') IS NOT NULL THEN
    INSERT INTO public.story_history (
      story_id, occurred_at, event_type, label, detail, meta, actor_id, source
    )
    SELECT
      entity_id, occurred_at, event_type, label, detail, meta, actor_id, source
    FROM public.entity_audit_events
    WHERE entity_type = 'story';

    INSERT INTO public.story_chunks_history (
      story_id, chunk_index, occurred_at, event_type, label, detail, meta, actor_id, source
    )
    SELECT
      story_id, chunk_index, occurred_at, event_type, label, detail, meta, actor_id, source
    FROM public.entity_audit_events
    WHERE entity_type = 'story_chunk';

    INSERT INTO public.claims_history (
      claim_id, occurred_at, event_type, label, detail, meta, actor_id, source
    )
    SELECT
      entity_id, occurred_at, event_type, label, detail, meta, actor_id, source
    FROM public.entity_audit_events
    WHERE entity_type = 'claim';

    INSERT INTO public.events_history (
      event_id, occurred_at, event_type, label, detail, meta, actor_id, source
    )
    SELECT
      entity_id, occurred_at, event_type, label, detail, meta, actor_id, source
    FROM public.entity_audit_events
    WHERE entity_type = 'event';

    INSERT INTO public.positions_history (
      canonical_position_id, occurred_at, event_type, label, detail, meta, actor_id, source
    )
    SELECT
      entity_id, occurred_at, event_type, label, detail, meta, actor_id, source
    FROM public.entity_audit_events
    WHERE entity_type = 'position';

    DROP TABLE public.entity_audit_events;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.append_entity_audit_event(text, uuid, uuid, smallint, text, text, text, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION public.append_story_history(
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
  INSERT INTO public.story_history (
    story_id, event_type, label, detail, meta, actor_id, source
  )
  VALUES (
    p_story_id, p_event_type, p_label, p_detail,
    COALESCE(p_meta, '{}'::jsonb), p_actor_id, p_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_story_chunks_history(
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
  INSERT INTO public.story_chunks_history (
    story_id, chunk_index, event_type, label, detail, meta, actor_id, source
  )
  VALUES (
    p_story_id, p_chunk_index, p_event_type, p_label, p_detail,
    COALESCE(p_meta, '{}'::jsonb), p_actor_id, p_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_claims_history(
  p_claim_id uuid,
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
  INSERT INTO public.claims_history (
    claim_id, event_type, label, detail, meta, actor_id, source
  )
  VALUES (
    p_claim_id, p_event_type, p_label, p_detail,
    COALESCE(p_meta, '{}'::jsonb), p_actor_id, p_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_events_history(
  p_event_id uuid,
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
  INSERT INTO public.events_history (
    event_id, event_type, label, detail, meta, actor_id, source
  )
  VALUES (
    p_event_id, p_event_type, p_label, p_detail,
    COALESCE(p_meta, '{}'::jsonb), p_actor_id, p_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_positions_history(
  p_canonical_position_id uuid,
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
  INSERT INTO public.positions_history (
    canonical_position_id, event_type, label, detail, meta, actor_id, source
  )
  VALUES (
    p_canonical_position_id, p_event_type, p_label, p_detail,
    COALESCE(p_meta, '{}'::jsonb), p_actor_id, p_source
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
  RETURN public.append_story_history(
    p_story_id, p_event_type, p_label, p_detail, p_meta, p_actor_id, p_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_story_history FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_story_history TO service_role;

REVOKE ALL ON FUNCTION public.append_story_chunks_history FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_story_chunks_history TO service_role;

REVOKE ALL ON FUNCTION public.append_claims_history FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_claims_history TO service_role;

REVOKE ALL ON FUNCTION public.append_events_history FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_events_history TO service_role;

REVOKE ALL ON FUNCTION public.append_positions_history FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_positions_history TO service_role;

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
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Qualification status changed',
      COALESCE(OLD.relevance_status, '—') || ' → ' || COALESCE(NEW.relevance_status, '—'),
      jsonb_build_object('field', 'relevance_status', 'old', OLD.relevance_status, 'new', NEW.relevance_status),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.extraction_qa_status IS DISTINCT FROM NEW.extraction_qa_status THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Extraction QA status changed',
      COALESCE(OLD.extraction_qa_status, '—') || ' → ' || COALESCE(NEW.extraction_qa_status, '—'),
      jsonb_build_object('field', 'extraction_qa_status', 'old', OLD.extraction_qa_status, 'new', NEW.extraction_qa_status),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.relevance_score IS DISTINCT FROM NEW.relevance_score THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Relevance score changed',
      COALESCE(OLD.relevance_score::text, '—') || ' → ' || COALESCE(NEW.relevance_score::text, '—'),
      jsonb_build_object('field', 'relevance_score', 'old', OLD.relevance_score, 'new', NEW.relevance_score),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.merged_at IS DISTINCT FROM NEW.merged_at THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change',
      CASE WHEN NEW.merged_at IS NULL THEN 'Merge cleared' ELSE 'Story merged' END,
      CASE WHEN NEW.merged_at IS NULL THEN 'merged_at cleared' ELSE to_char(NEW.merged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC' END,
      jsonb_build_object('field', 'merged_at', 'old', OLD.merged_at, 'new', NEW.merged_at),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.extraction_completed_at IS DISTINCT FROM NEW.extraction_completed_at THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change',
      CASE WHEN NEW.extraction_completed_at IS NULL THEN 'Extraction completion cleared' ELSE 'Extraction completed' END,
      NULL,
      jsonb_build_object('field', 'extraction_completed_at', 'old', OLD.extraction_completed_at, 'new', NEW.extraction_completed_at),
      NULL, 'trigger:stories'
    );
  END IF;

  IF OLD.scrape_skipped IS DISTINCT FROM NEW.scrape_skipped THEN
    PERFORM public.append_story_history(
      NEW.story_id, 'field_change', 'Scrape skipped flag changed',
      COALESCE(OLD.scrape_skipped::text, '—') || ' → ' || COALESCE(NEW.scrape_skipped::text, '—'),
      jsonb_build_object('field', 'scrape_skipped', 'old', OLD.scrape_skipped, 'new', NEW.scrape_skipped),
      NULL, 'trigger:stories'
    );
  END IF;

  RETURN NEW;
END;
$$;
