-- Claim-level merge eligibility (parking) + approve queue for linear K-Claims pipeline.

set search_path = public, extensions;

alter table public.story_chunks
  add column if not exists claims_merge_eligibility jsonb not null default jsonb_build_object(
    'parked', '[]'::jsonb,
    'repair_queue', '[]'::jsonb,
    'rejected_final', '[]'::jsonb,
    'pending_approval_claim_ids', '[]'::jsonb,
    'last_repair_version_id', null
  );

comment on column public.story_chunks.claims_merge_eligibility is
  'Per-chunk claim parking for merge: parked (merge-eligible), repair_queue, rejected_final.';

alter table public.story_chunks drop constraint if exists story_chunks_extraction_qa_status_check;

alter table public.story_chunks
  add constraint story_chunks_extraction_qa_status_check
    check (extraction_qa_status in (
      'pending',
      'reviewed',
      'standardized',
      'needs_refinement',
      'refined',
      'awaiting_approval',
      'atoms_passed',
      'passed',
      'needs_human_review'
    ));

comment on column public.story_chunks.extraction_qa_status is
  'Claims lane: pending -> passed | needs_refinement -> awaiting_approval -> passed (merge-ready).';

create or replace function public.get_chunks_ready_for_chunk_qa(p_stage text, p_limit int default 5)
returns table (story_id uuid, chunk_index int, content text, extraction_json jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select sc.story_id, sc.chunk_index, sc.content, sc.extraction_json
  from public.story_chunks sc
  where sc.extraction_json is not null
    and (
      (p_stage = 'standardize' and sc.extraction_qa_status = 'pending')
      or (p_stage = 'validate_claims' and sc.extraction_qa_status = 'pending')
      or (
        p_stage = 'refine'
        and sc.extraction_qa_refinement_count < 3
        and sc.extraction_qa_validation_attempt_count < 3
        and sc.extraction_qa_status = 'needs_refinement'
        and jsonb_array_length(coalesce(sc.claims_merge_eligibility->'repair_queue', '[]'::jsonb)) > 0
      )
      or (p_stage = 'approve_claims' and sc.extraction_qa_status = 'awaiting_approval')
      or (p_stage = 'validate'
          and sc.extraction_qa_status in ('standardized', 'refined')
          and sc.extraction_qa_validated_at is null)
      or (p_stage = 'link' and sc.extraction_qa_status = 'atoms_passed')
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_chunks_ready_for_chunk_qa(text, int) is
  'Queue: standardize | validate_claims | refine | approve_claims | validate | link.';

create or replace function public.get_stories_ready_to_merge(p_limit int default 1)
returns table (story_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.story_id
  from public.stories s
  where s.merged_at is null
    and exists (select 1 from public.story_chunks sc where sc.story_id = s.story_id)
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id and sc.extraction_json is null
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and coalesce(sc.extraction_qa_status, 'pending') not in ('passed', 'atoms_passed')
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and jsonb_array_length(coalesce(sc.claims_merge_eligibility->'repair_queue', '[]'::jsonb)) > 0
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and jsonb_array_length(coalesce(sc.claims_merge_eligibility->'pending_approval_claim_ids', '[]'::jsonb)) > 0
    )
    and not exists (select 1 from public.story_claims sc where sc.story_id = s.story_id)
    and not exists (select 1 from public.story_positions sp where sp.story_id = s.story_id)
    and not exists (select 1 from public.story_events se where se.story_id = s.story_id)
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_stories_ready_to_merge(int) is
  'Stories ready for merge: all chunks passed QA, repair queue empty, no story_claims yet.';

-- reset_story_extraction: clear claims_merge_eligibility
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
  v_claim_versions_deleted int := 0;
  v_orphan_claims_deleted int := 0;
  v_orphan_events_deleted int := 0;
  v_orphan_positions_deleted int := 0;
  v_step_runs_deleted int := 0;
  v_extraction_step_ids text[] := array[
    'chunk-story-bodies',
    'extract-story-claims',
    'validate-chunk-claims',
    'refine-chunk-claims',
    'approve-chunk-claims',
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

  update public.story_chunks
  set active_claim_version_id = null
  where story_id = p_story_id;

  delete from public.chunk_claim_versions where story_id = p_story_id;
  get diagnostics v_claim_versions_deleted = row_count;

  delete from public.story_extraction_qa_artifacts where story_id = p_story_id;
  get diagnostics v_qa_artifacts_deleted = row_count;

  delete from public.story_extraction_feedback where story_id = p_story_id;
  get diagnostics v_feedback_deleted = row_count;

  update public.story_chunks
  set
    extraction_json = null,
    active_claim_version_id = null,
    extraction_completed_at = null,
    extraction_qa_status = null,
    extraction_qa_review_report = null,
    extraction_qa_standardization_report = null,
    extraction_qa_validation_report = null,
    extraction_qa_refinement_count = 0,
    extraction_qa_validation_attempt_count = 0,
    extraction_qa_validated_at = null,
    claims_merge_eligibility = jsonb_build_object(
      'parked', '[]'::jsonb,
      'repair_queue', '[]'::jsonb,
      'rejected_final', '[]'::jsonb,
      'pending_approval_claim_ids', '[]'::jsonb,
      'last_repair_version_id', null
    ),
    positions_extraction_json = null,
    positions_qa_status = null,
    positions_qa_review_report = null,
    positions_qa_validation_report = null,
    positions_qa_refinement_count = 0,
    positions_qa_validation_attempt_count = 0,
    positions_qa_validated_at = null
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

  delete from public.story_step_runs
  where story_id = p_story_id
    and step_id = any (v_extraction_step_ids);
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

  return jsonb_build_object(
    'story_id', p_story_id,
    'story_claims_deleted', v_story_claims_deleted,
    'story_evidence_deleted', v_story_evidence_deleted,
    'story_positions_deleted', v_story_positions_deleted,
    'story_events_deleted', v_story_events_deleted,
    'qa_artifacts_deleted', v_qa_artifacts_deleted,
    'feedback_deleted', v_feedback_deleted,
    'chunks_reset', v_chunks_reset,
    'claim_versions_deleted', v_claim_versions_deleted,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted,
    'step_runs_deleted', v_step_runs_deleted
  );
end;
$$;
