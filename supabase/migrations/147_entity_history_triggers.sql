-- Point entity audit triggers at per-table *_history append functions.

CREATE OR REPLACE FUNCTION public.story_chunks_log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.audit_trigger_skipped() THEN
    IF tg_op = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF tg_op = 'INSERT' THEN
    PERFORM public.append_story_chunks_history(
      NEW.story_id, NEW.chunk_index,
      'created', 'Chunk created',
      left(NEW.content, 120),
      jsonb_build_object('content_length', length(NEW.content)),
      NULL, 'trigger:story_chunks'
    );
    RETURN NEW;
  END IF;

  IF tg_op = 'DELETE' THEN
    PERFORM public.append_story_chunks_history(
      OLD.story_id, OLD.chunk_index,
      'deleted', 'Chunk deleted',
      NULL, '{}'::jsonb, NULL, 'trigger:story_chunks'
    );
    RETURN OLD;
  END IF;

  IF OLD.extraction_qa_status IS DISTINCT FROM NEW.extraction_qa_status THEN
    PERFORM public.append_story_chunks_history(
      NEW.story_id, NEW.chunk_index,
      'field_change', 'Chunk QA status changed',
      COALESCE(OLD.extraction_qa_status, '—') || ' → ' || COALESCE(NEW.extraction_qa_status, '—'),
      jsonb_build_object('field', 'extraction_qa_status', 'old', OLD.extraction_qa_status, 'new', NEW.extraction_qa_status),
      NULL, 'trigger:story_chunks'
    );
  END IF;

  IF (OLD.extraction_json IS NULL) IS DISTINCT FROM (NEW.extraction_json IS NULL) THEN
    PERFORM public.append_story_chunks_history(
      NEW.story_id, NEW.chunk_index,
      'field_change',
      CASE WHEN NEW.extraction_json IS NULL THEN 'Chunk extraction cleared' ELSE 'Chunk extraction completed' END,
      NULL,
      jsonb_build_object(
        'field', 'extraction_json',
        'had_extraction', OLD.extraction_json IS NOT NULL,
        'has_extraction', NEW.extraction_json IS NOT NULL
      ),
      NULL, 'trigger:story_chunks'
    );
  END IF;

  IF OLD.extraction_qa_validated_at IS DISTINCT FROM NEW.extraction_qa_validated_at THEN
    PERFORM public.append_story_chunks_history(
      NEW.story_id, NEW.chunk_index,
      'field_change',
      CASE WHEN NEW.extraction_qa_validated_at IS NULL THEN 'Chunk QA validation cleared' ELSE 'Chunk QA validated' END,
      NULL,
      jsonb_build_object('field', 'extraction_qa_validated_at', 'old', OLD.extraction_qa_validated_at, 'new', NEW.extraction_qa_validated_at),
      NULL, 'trigger:story_chunks'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.audit_trigger_skipped() THEN
    IF tg_op = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF tg_op = 'INSERT' THEN
    PERFORM public.append_claims_history(
      NEW.claim_id,
      'created', 'Canonical claim created',
      left(NEW.canonical_text, 160),
      jsonb_build_object('canonical_hash', NEW.canonical_hash),
      NULL, 'trigger:claims'
    );
    RETURN NEW;
  END IF;

  IF tg_op = 'DELETE' THEN
    PERFORM public.append_claims_history(
      OLD.claim_id,
      'deleted', 'Canonical claim deleted',
      left(OLD.canonical_text, 160),
      '{}'::jsonb, NULL, 'trigger:claims'
    );
    RETURN OLD;
  END IF;

  IF OLD.canonical_text IS DISTINCT FROM NEW.canonical_text THEN
    PERFORM public.append_claims_history(
      NEW.claim_id,
      'field_change', 'Canonical text updated',
      left(NEW.canonical_text, 160),
      jsonb_build_object('field', 'canonical_text'),
      NULL, 'trigger:claims'
    );
  END IF;

  IF OLD.subject IS DISTINCT FROM NEW.subject
     OR OLD.predicate IS DISTINCT FROM NEW.predicate
     OR OLD.object IS DISTINCT FROM NEW.object THEN
    PERFORM public.append_claims_history(
      NEW.claim_id,
      'field_change', 'Claim SPO updated',
      concat_ws(' · ', NEW.subject, NEW.predicate, NEW.object),
      jsonb_build_object('field', 'subject_predicate_object'),
      NULL, 'trigger:claims'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.events_log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.audit_trigger_skipped() THEN
    IF tg_op = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF tg_op = 'INSERT' THEN
    PERFORM public.append_events_history(
      NEW.event_id,
      'created', 'Canonical event created',
      left(NEW.canonical_text, 160),
      jsonb_build_object('canonical_hash', NEW.canonical_hash),
      NULL, 'trigger:events'
    );
    RETURN NEW;
  END IF;

  IF tg_op = 'DELETE' THEN
    PERFORM public.append_events_history(
      OLD.event_id,
      'deleted', 'Canonical event deleted',
      left(OLD.canonical_text, 160),
      '{}'::jsonb, NULL, 'trigger:events'
    );
    RETURN OLD;
  END IF;

  IF OLD.canonical_text IS DISTINCT FROM NEW.canonical_text THEN
    PERFORM public.append_events_history(
      NEW.event_id,
      'field_change', 'Canonical text updated',
      left(NEW.canonical_text, 160),
      jsonb_build_object('field', 'canonical_text'),
      NULL, 'trigger:events'
    );
  END IF;

  IF OLD.primary_actor IS DISTINCT FROM NEW.primary_actor
     OR OLD.action IS DISTINCT FROM NEW.action
     OR OLD.event_date IS DISTINCT FROM NEW.event_date THEN
    PERFORM public.append_events_history(
      NEW.event_id,
      'field_change', 'Event fields updated',
      concat_ws(' · ', NEW.primary_actor, NEW.action, NEW.event_date::text),
      jsonb_build_object('field', 'actor_action_date'),
      NULL, 'trigger:events'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_positions_log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.audit_trigger_skipped() THEN
    IF tg_op = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF tg_op = 'INSERT' THEN
    PERFORM public.append_positions_history(
      NEW.canonical_position_id,
      'created', 'Canonical position created',
      left(NEW.canonical_text, 160),
      jsonb_build_object('canonical_hash', NEW.canonical_hash),
      NULL, 'trigger:canonical_positions'
    );
    RETURN NEW;
  END IF;

  IF tg_op = 'DELETE' THEN
    PERFORM public.append_positions_history(
      OLD.canonical_position_id,
      'deleted', 'Canonical position deleted',
      left(OLD.canonical_text, 160),
      '{}'::jsonb, NULL, 'trigger:canonical_positions'
    );
    RETURN OLD;
  END IF;

  IF OLD.canonical_text IS DISTINCT FROM NEW.canonical_text THEN
    PERFORM public.append_positions_history(
      NEW.canonical_position_id,
      'field_change', 'Canonical text updated',
      left(NEW.canonical_text, 160),
      jsonb_build_object('field', 'canonical_text'),
      NULL, 'trigger:canonical_positions'
    );
  END IF;

  IF OLD.primary_topic_id IS DISTINCT FROM NEW.primary_topic_id THEN
    PERFORM public.append_positions_history(
      NEW.canonical_position_id,
      'field_change', 'Primary topic updated',
      COALESCE(OLD.primary_topic_id::text, '—') || ' → ' || COALESCE(NEW.primary_topic_id::text, '—'),
      jsonb_build_object('field', 'primary_topic_id', 'old', OLD.primary_topic_id, 'new', NEW.primary_topic_id),
      NULL, 'trigger:canonical_positions'
    );
  END IF;

  RETURN NEW;
END;
$$;
