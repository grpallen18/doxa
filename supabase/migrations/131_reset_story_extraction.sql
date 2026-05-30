-- Admin reset: wipe one story's extraction pipeline output back to chunks awaiting extraction.
-- Orphan-only canonical cleanup for claims/events/positions linked exclusively to this story.

set search_path = public, extensions;

create or replace function public.reset_story_extraction(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
begin
  if not exists (select 1 from public.stories s where s.story_id = p_story_id) then
    raise exception 'Story not found: %', p_story_id;
  end if;

  select coalesce(array_agg(distinct sc.claim_id), '{}')
  into v_claim_ids
  from public.story_claims sc
  where sc.story_id = p_story_id
    and sc.claim_id is not null;

  select coalesce(array_agg(distinct se.event_id), '{}')
  into v_event_ids
  from public.story_events se
  where se.story_id = p_story_id
    and se.event_id is not null;

  select coalesce(array_agg(distinct sp.canonical_position_id), '{}')
  into v_position_ids
  from public.story_positions sp
  where sp.story_id = p_story_id
    and sp.canonical_position_id is not null;

  delete from public.story_claims where story_id = p_story_id;
  get diagnostics v_story_claims_deleted = row_count;

  delete from public.story_evidence where story_id = p_story_id;
  get diagnostics v_story_evidence_deleted = row_count;

  delete from public.story_positions where story_id = p_story_id;
  get diagnostics v_story_positions_deleted = row_count;

  delete from public.story_events where story_id = p_story_id;
  get diagnostics v_story_events_deleted = row_count;

  delete from public.story_extraction_qa_artifacts where story_id = p_story_id;
  get diagnostics v_qa_artifacts_deleted = row_count;

  delete from public.story_extraction_feedback where story_id = p_story_id;
  get diagnostics v_feedback_deleted = row_count;

  update public.story_chunks
  set
    extraction_json = null,
    extraction_completed_at = null,
    extraction_qa_status = null,
    extraction_qa_review_report = null,
    extraction_qa_validation_report = null,
    extraction_qa_refinement_count = 0,
    extraction_qa_validated_at = null
  where story_id = p_story_id;
  get diagnostics v_chunks_reset = row_count;

  update public.stories
  set
    merged_at = null,
    extraction_completed_at = null,
    extraction_skipped_empty = false,
    extraction_qa_status = null,
    extraction_qa_review_report = null,
    extraction_qa_validation_report = null,
    extraction_qa_refinement_count = 0,
    extraction_qa_validated_at = null
  where story_id = p_story_id;

  if coalesce(array_length(v_claim_ids, 1), 0) > 0 then
    delete from public.claims c
    where c.claim_id = any (v_claim_ids)
      and not exists (
        select 1 from public.story_claims sc where sc.claim_id = c.claim_id
      );
    get diagnostics v_orphan_claims_deleted = row_count;
  end if;

  if coalesce(array_length(v_event_ids, 1), 0) > 0 then
    delete from public.events e
    where e.event_id = any (v_event_ids)
      and not exists (
        select 1 from public.story_events se where se.event_id = e.event_id
      );
    get diagnostics v_orphan_events_deleted = row_count;
  end if;

  if coalesce(array_length(v_position_ids, 1), 0) > 0 then
    delete from public.canonical_positions cp
    where cp.canonical_position_id = any (v_position_ids)
      and not exists (
        select 1 from public.story_positions sp where sp.canonical_position_id = cp.canonical_position_id
      );
    get diagnostics v_orphan_positions_deleted = row_count;
  end if;

  return jsonb_build_object(
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
end;
$$;

comment on function public.reset_story_extraction(uuid) is
  'Admin: reset one story to chunks awaiting extraction. Deletes story_* entities, QA artifacts, feedback; resets chunk/story QA columns; deletes orphan canonical rows only.';

revoke all on function public.reset_story_extraction(uuid) from public;
grant execute on function public.reset_story_extraction(uuid) to service_role;
