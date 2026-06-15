-- Reset all stories (or one story) to post-ingestion state: keep scrape/clean, delete chunks + extraction downstream.

set search_path = public, extensions;

create or replace function public.reset_story_post_ingestion(p_story_id uuid)
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
  v_chunks_deleted int := 0;
  v_chunks_history_deleted int := 0;
  v_claim_versions_deleted int := 0;
  v_orphan_claims_deleted int := 0;
  v_orphan_events_deleted int := 0;
  v_orphan_positions_deleted int := 0;
  v_step_runs_deleted int := 0;
  v_post_ingestion_step_ids text[] := array[
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
begin
  perform set_config('app.skip_story_audit_trigger', 'true', true);

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

  delete from public.chunk_claim_versions where story_id = p_story_id;
  get diagnostics v_claim_versions_deleted = row_count;

  delete from public.story_extraction_qa_artifacts where story_id = p_story_id;
  get diagnostics v_qa_artifacts_deleted = row_count;

  delete from public.story_extraction_feedback where story_id = p_story_id;
  get diagnostics v_feedback_deleted = row_count;

  delete from public.story_chunks where story_id = p_story_id;
  get diagnostics v_chunks_deleted = row_count;

  delete from public.story_chunks_history where story_id = p_story_id;
  get diagnostics v_chunks_history_deleted = row_count;

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

  delete from public.story_step_runs
  where story_id = p_story_id
    and step_id = any (v_post_ingestion_step_ids);
  get diagnostics v_step_runs_deleted = row_count;

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

  perform public.append_story_audit_event(
    p_story_id,
    'admin_action',
    'Post-ingestion reset',
    'reset_story_post_ingestion',
    jsonb_build_object(
      'story_claims_deleted', v_story_claims_deleted,
      'story_evidence_deleted', v_story_evidence_deleted,
      'story_positions_deleted', v_story_positions_deleted,
      'story_events_deleted', v_story_events_deleted,
      'qa_artifacts_deleted', v_qa_artifacts_deleted,
      'feedback_deleted', v_feedback_deleted,
      'chunks_deleted', v_chunks_deleted,
      'chunks_history_deleted', v_chunks_history_deleted,
      'claim_versions_deleted', v_claim_versions_deleted,
      'orphan_claims_deleted', v_orphan_claims_deleted,
      'orphan_events_deleted', v_orphan_events_deleted,
      'orphan_positions_deleted', v_orphan_positions_deleted,
      'step_runs_deleted', v_step_runs_deleted
    ),
    null,
    'rpc:reset_story_post_ingestion'
  );

  perform set_config('app.skip_story_audit_trigger', 'false', true);

  return jsonb_build_object(
    'story_id', p_story_id,
    'story_claims_deleted', v_story_claims_deleted,
    'story_evidence_deleted', v_story_evidence_deleted,
    'story_positions_deleted', v_story_positions_deleted,
    'story_events_deleted', v_story_events_deleted,
    'qa_artifacts_deleted', v_qa_artifacts_deleted,
    'feedback_deleted', v_feedback_deleted,
    'chunks_deleted', v_chunks_deleted,
    'chunks_history_deleted', v_chunks_history_deleted,
    'claim_versions_deleted', v_claim_versions_deleted,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted,
    'step_runs_deleted', v_step_runs_deleted
  );
end;
$$;

comment on function public.reset_story_post_ingestion(uuid) is
  'Admin reset: delete chunks and all extraction/merge/canonical progress for one story. Ingestion (scrape/clean) is preserved.';

revoke all on function public.reset_story_post_ingestion(uuid) from public;
grant execute on function public.reset_story_post_ingestion(uuid) to service_role;

create or replace function public.reset_all_stories_post_ingestion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_story_claims_deleted int := 0;
  v_story_evidence_deleted int := 0;
  v_story_positions_deleted int := 0;
  v_story_events_deleted int := 0;
  v_qa_artifacts_deleted int := 0;
  v_feedback_deleted int := 0;
  v_chunks_deleted int := 0;
  v_chunks_history_deleted int := 0;
  v_claim_versions_deleted int := 0;
  v_orphan_claims_deleted int := 0;
  v_orphan_events_deleted int := 0;
  v_orphan_positions_deleted int := 0;
  v_step_runs_deleted int := 0;
  v_stories_reset int := 0;
  v_post_ingestion_step_ids text[] := array[
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
begin
  perform set_config('app.skip_story_audit_trigger', 'true', true);

  delete from public.story_claims;
  get diagnostics v_story_claims_deleted = row_count;

  delete from public.story_evidence;
  get diagnostics v_story_evidence_deleted = row_count;

  delete from public.story_positions;
  get diagnostics v_story_positions_deleted = row_count;

  delete from public.story_events;
  get diagnostics v_story_events_deleted = row_count;

  delete from public.chunk_claim_versions;
  get diagnostics v_claim_versions_deleted = row_count;

  delete from public.story_extraction_qa_artifacts;
  get diagnostics v_qa_artifacts_deleted = row_count;

  delete from public.story_extraction_feedback;
  get diagnostics v_feedback_deleted = row_count;

  delete from public.story_chunks;
  get diagnostics v_chunks_deleted = row_count;

  delete from public.story_chunks_history;
  get diagnostics v_chunks_history_deleted = row_count;

  update public.stories
  set
    merged_at = null,
    extraction_completed_at = null,
    extraction_skipped_empty = false,
    extraction_qa_status = null,
    extraction_qa_review_report = null,
    extraction_qa_validation_report = null,
    extraction_qa_refinement_count = 0,
    extraction_qa_validated_at = null;
  get diagnostics v_stories_reset = row_count;

  delete from public.story_step_runs
  where step_id = any (v_post_ingestion_step_ids);
  get diagnostics v_step_runs_deleted = row_count;

  delete from public.claims c
  where not exists (
    select 1 from public.story_claims sc where sc.claim_id = c.claim_id
  );
  get diagnostics v_orphan_claims_deleted = row_count;

  delete from public.events e
  where not exists (
    select 1 from public.story_events se where se.event_id = e.event_id
  );
  get diagnostics v_orphan_events_deleted = row_count;

  delete from public.canonical_positions cp
  where not exists (
    select 1 from public.story_positions sp where sp.canonical_position_id = cp.canonical_position_id
  );
  get diagnostics v_orphan_positions_deleted = row_count;

  perform set_config('app.skip_story_audit_trigger', 'false', true);

  return jsonb_build_object(
    'stories_reset', v_stories_reset,
    'story_claims_deleted', v_story_claims_deleted,
    'story_evidence_deleted', v_story_evidence_deleted,
    'story_positions_deleted', v_story_positions_deleted,
    'story_events_deleted', v_story_events_deleted,
    'qa_artifacts_deleted', v_qa_artifacts_deleted,
    'feedback_deleted', v_feedback_deleted,
    'chunks_deleted', v_chunks_deleted,
    'chunks_history_deleted', v_chunks_history_deleted,
    'claim_versions_deleted', v_claim_versions_deleted,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted,
    'step_runs_deleted', v_step_runs_deleted
  );
end;
$$;

comment on function public.reset_all_stories_post_ingestion() is
  'Admin bulk reset: delete all chunks and extraction/merge/canonical progress. Stories keep ingestion fields and story_bodies.content_clean.';

revoke all on function public.reset_all_stories_post_ingestion() from public;
grant execute on function public.reset_all_stories_post_ingestion() to service_role;
