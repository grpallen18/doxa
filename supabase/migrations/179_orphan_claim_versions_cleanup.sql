-- Delete orphaned refiner claim versions; revert refine removes output version rows.
-- Re-apply revert_chunk_pipeline_step / revert_story_pipeline_step bodies after 178/176.

set search_path = public, extensions;

create or replace function public.is_orphaned_refiner_claim_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chunk_claim_versions ccv
    where ccv.id = p_version_id
      and ccv.source = 'refiner'
      and not exists (
        select 1
        from public.story_extraction_qa_artifacts a
        where a.reverted_at is null
          and a.stage in ('chunk_refine_claims', 'chunk_refine')
          and (
            a.output_claim_version_id = ccv.id
            or a.report->>'output_claim_version_id' = ccv.id::text
          )
      )
  );
$$;

comment on function public.is_orphaned_refiner_claim_version(uuid) is
  'True when a refiner claim version has no active (non-reverted) refinement artifact.';

create or replace function public.delete_refiner_claim_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_version_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.story_chunks sc
    where sc.active_claim_version_id = p_version_id
  ) then
    raise exception 'Cannot delete active claim version %', p_version_id;
  end if;

  update public.story_extraction_qa_artifacts
  set claim_version_id = null
  where claim_version_id = p_version_id;

  update public.story_extraction_qa_artifacts
  set input_claim_version_id = null
  where input_claim_version_id = p_version_id;

  update public.story_extraction_qa_artifacts
  set output_claim_version_id = null
  where output_claim_version_id = p_version_id;

  delete from public.chunk_claim_versions
  where id = p_version_id
    and source = 'refiner';
end;
$$;

comment on function public.delete_refiner_claim_version(uuid) is
  'Removes a non-active refiner claim version and clears artifact FK pointers.';

create or replace function public.cleanup_orphaned_claim_versions(
  p_story_id uuid default null,
  p_chunk_index int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reset_active int := 0;
  v_deleted int := 0;
  v_version_id uuid;
begin
  update public.story_chunks sc
  set
    active_claim_version_id = ccv.parent_version_id,
    extraction_json = coalesce(parent.claims_json, sc.extraction_json)
  from public.chunk_claim_versions ccv
  left join public.chunk_claim_versions parent on parent.id = ccv.parent_version_id
  where sc.story_id = ccv.story_id
    and sc.chunk_index = ccv.chunk_index
    and sc.active_claim_version_id = ccv.id
    and ccv.source = 'refiner'
    and public.is_orphaned_refiner_claim_version(ccv.id)
    and (p_story_id is null or sc.story_id = p_story_id)
    and (p_chunk_index is null or sc.chunk_index = p_chunk_index);
  get diagnostics v_reset_active = row_count;

  for v_version_id in
    select ccv.id
    from public.chunk_claim_versions ccv
    where ccv.source = 'refiner'
      and public.is_orphaned_refiner_claim_version(ccv.id)
      and (p_story_id is null or ccv.story_id = p_story_id)
      and (p_chunk_index is null or ccv.chunk_index = p_chunk_index)
      and not exists (
        select 1
        from public.story_chunks sc
        where sc.story_id = ccv.story_id
          and sc.chunk_index = ccv.chunk_index
          and sc.active_claim_version_id = ccv.id
      )
  loop
    perform public.delete_refiner_claim_version(v_version_id);
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object(
    'active_pointers_reset', v_reset_active,
    'deleted', v_deleted
  );
end;
$$;

comment on function public.cleanup_orphaned_claim_versions(uuid, int) is
  'Deletes refiner claim versions with no active refinement artifact; resets active pointer when needed.';

revoke all on function public.is_orphaned_refiner_claim_version(uuid) from public;
revoke all on function public.delete_refiner_claim_version(uuid) from public;
revoke all on function public.cleanup_orphaned_claim_versions(uuid, int) from public;
grant execute on function public.is_orphaned_refiner_claim_version(uuid) to service_role;
grant execute on function public.delete_refiner_claim_version(uuid) to service_role;
grant execute on function public.cleanup_orphaned_claim_versions(uuid, int) to service_role;

-- One-time purge of legacy orphaned refiner versions.
select public.cleanup_orphaned_claim_versions(null, null);

create or replace function public.revert_chunk_pipeline_step(
  p_story_id uuid,
  p_step_id text,
  p_chunk_index int,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'extract-story-claims',
    'validate-chunk-claims',
    'refine-chunk-claims',
    'extract-story-positions',
    'validate-chunk-positions',
    'refine-chunk-positions'
  ];
  v_latest_run_id uuid;
  v_latest_run_at timestamptz;
  v_prior_report jsonb;
  v_attempt_number int;
  v_status text;
  v_chunks_reset int := 0;
  v_rec record;
begin
  if p_chunk_index is null or p_chunk_index < 0 then
    raise exception 'chunk_index is required for chunk-layer revert';
  end if;

  if not (p_step_id = any (v_allowed)) then
    raise exception 'Step cannot be reverted at chunk layer: %', p_step_id;
  end if;

  if not exists (
    select 1 from public.story_chunks sc
    where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index
  ) then
    raise exception 'Chunk not found: index %', p_chunk_index;
  end if;

  case p_step_id
    when 'extract-story-claims' then
      if not exists (
        select 1 from public.story_chunks sc
        where sc.story_id = p_story_id
          and sc.chunk_index = p_chunk_index
          and sc.extraction_json is not null
      ) then
        raise exception 'Step not executed: extract-story-claims for chunk %', p_chunk_index;
      end if;

      delete from public.chunk_claim_versions
      where story_id = p_story_id and chunk_index = p_chunk_index;

      update public.story_chunks
      set
        extraction_json = null,
        active_claim_version_id = null,
        extraction_qa_status = null,
        extraction_qa_review_report = null,
        extraction_qa_standardization_report = null,
        extraction_qa_validation_report = null,
        extraction_qa_refinement_count = 0,
        extraction_qa_validation_attempt_count = 0,
        extraction_qa_validated_at = null
      where story_id = p_story_id and chunk_index = p_chunk_index;
      get diagnostics v_chunks_reset = row_count;

    when 'extract-story-positions' then
      if not exists (
        select 1 from public.story_chunks sc
        where sc.story_id = p_story_id
          and sc.chunk_index = p_chunk_index
          and sc.positions_extraction_json is not null
      ) then
        raise exception 'Step not executed: extract-story-positions for chunk %', p_chunk_index;
      end if;

      update public.story_chunks
      set
        positions_extraction_json = null,
        positions_extraction_completed_at = null,
        positions_qa_status = null,
        positions_qa_review_report = null,
        positions_qa_validation_report = null,
        positions_qa_refinement_count = 0,
        positions_qa_validation_attempt_count = 0,
        positions_qa_validated_at = null
      where story_id = p_story_id and chunk_index = p_chunk_index;
      get diagnostics v_chunks_reset = row_count;

      delete from public.story_extraction_qa_artifacts
      where story_id = p_story_id
        and chunk_index = p_chunk_index
        and stage in ('chunk_extract_positions');

    when 'refine-chunk-claims' then
      select a.run_id, a.created_at
      into v_latest_run_id, v_latest_run_at
      from public.story_extraction_qa_artifacts a
      where a.story_id = p_story_id
        and a.chunk_index = p_chunk_index
        and a.stage = 'chunk_refine_claims'
        and a.reverted_at is null
      order by a.created_at desc
      limit 1;

      if v_latest_run_at is null then
        raise exception 'Step not executed: refine-chunk-claims for chunk %', p_chunk_index;
      end if;

      for v_rec in
        select
          a.chunk_index,
          a.output_claim_version_id,
          a.input_claim_version_id,
          a.input_snapshot,
          cv.parent_version_id,
          cv.created_from_review_artifact_id
        from public.story_extraction_qa_artifacts a
        left join public.chunk_claim_versions cv on cv.id = a.output_claim_version_id
        where a.story_id = p_story_id
          and a.chunk_index = p_chunk_index
          and a.stage = 'chunk_refine_claims'
          and a.reverted_at is null
          and (
            (v_latest_run_id is not null and a.run_id = v_latest_run_id)
            or (v_latest_run_id is null and a.created_at = v_latest_run_at)
          )
      loop
        if v_rec.parent_version_id is not null then
          select a.report into v_prior_report
          from public.story_extraction_qa_artifacts a
          where a.id = v_rec.created_from_review_artifact_id;

          update public.story_chunks sc
          set
            active_claim_version_id = v_rec.parent_version_id,
            extraction_json = (
              select ccv.claims_json from public.chunk_claim_versions ccv
              where ccv.id = v_rec.parent_version_id
            ),
            extraction_qa_refinement_count = greatest(0, coalesce(sc.extraction_qa_refinement_count, 0) - 1),
            extraction_qa_status = 'needs_refinement',
            extraction_qa_validated_at = null,
            extraction_qa_review_report = coalesce(v_prior_report, sc.extraction_qa_review_report),
            extraction_qa_validation_report = case
              when v_prior_report is not null then jsonb_build_object(
                'passes', false,
                'recommended_status', 'needs_refinement',
                'summary', v_prior_report->>'summary',
                'attempt_number', coalesce((v_prior_report->>'attempt_number')::int, 1),
                'deterministic_issues', coalesce(v_prior_report->'deterministic_issues', '[]'::jsonb)
              )
              else sc.extraction_qa_validation_report
            end
          where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
        else
          update public.story_chunks sc
          set
            extraction_json = coalesce(v_rec.input_snapshot, sc.extraction_json),
            active_claim_version_id = coalesce(v_rec.input_claim_version_id, sc.active_claim_version_id),
            extraction_qa_refinement_count = greatest(0, coalesce(sc.extraction_qa_refinement_count, 0) - 1),
            extraction_qa_status = 'needs_refinement',
            extraction_qa_validated_at = null
          where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
        end if;

        if v_rec.output_claim_version_id is not null then
          perform public.delete_refiner_claim_version(v_rec.output_claim_version_id);
        end if;

        v_chunks_reset := v_chunks_reset + 1;
      end loop;

      update public.story_extraction_qa_artifacts
      set reverted_at = now()
      where story_id = p_story_id
        and chunk_index = p_chunk_index
        and stage = 'chunk_refine_claims'
        and reverted_at is null
        and (
          (v_latest_run_id is not null and run_id = v_latest_run_id)
          or (v_latest_run_id is null and created_at = v_latest_run_at)
        );

    when 'refine-chunk-positions' then
      select a.run_id, a.created_at
      into v_latest_run_id, v_latest_run_at
      from public.story_extraction_qa_artifacts a
      where a.story_id = p_story_id
        and a.chunk_index = p_chunk_index
        and a.stage = 'chunk_refine_positions'
      order by a.created_at desc
      limit 1;

      if v_latest_run_at is null then
        raise exception 'Step not executed: refine-chunk-positions for chunk %', p_chunk_index;
      end if;

      for v_rec in
        select a.id, a.input_snapshot
        from public.story_extraction_qa_artifacts a
        where a.story_id = p_story_id
          and a.chunk_index = p_chunk_index
          and a.stage = 'chunk_refine_positions'
          and (
            (v_latest_run_id is not null and a.run_id = v_latest_run_id)
            or (v_latest_run_id is null and a.created_at = v_latest_run_at)
          )
      loop
        update public.story_chunks sc
        set
          positions_extraction_json = v_rec.input_snapshot,
          positions_qa_refinement_count = greatest(0, coalesce(sc.positions_qa_refinement_count, 0) - 1),
          positions_qa_status = 'needs_refinement',
          positions_qa_validated_at = null
        where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
        v_chunks_reset := v_chunks_reset + 1;
      end loop;

      delete from public.story_extraction_qa_artifacts
      where story_id = p_story_id
        and chunk_index = p_chunk_index
        and stage = 'chunk_refine_positions'
        and (
          (v_latest_run_id is not null and run_id = v_latest_run_id)
          or (v_latest_run_id is null and created_at = v_latest_run_at)
        );

    when 'validate-chunk-claims' then
      select a.run_id, a.created_at
      into v_latest_run_id, v_latest_run_at
      from public.story_extraction_qa_artifacts a
      where a.story_id = p_story_id
        and a.chunk_index = p_chunk_index
        and a.stage = 'chunk_review_claims'
        and a.reverted_at is null
      order by a.created_at desc
      limit 1;

      if v_latest_run_at is null then
        if not exists (
          select 1 from public.story_chunks sc
          where sc.story_id = p_story_id
            and sc.chunk_index = p_chunk_index
            and sc.extraction_qa_review_report is not null
        ) then
          raise exception 'Step not executed: validate-chunk-claims for chunk %', p_chunk_index;
        end if;

        update public.chunk_claim_versions ccv
        set review_outcome = null
        where ccv.story_id = p_story_id and ccv.chunk_index = p_chunk_index;

        update public.story_chunks
        set
          extraction_qa_status = 'pending',
          extraction_qa_review_report = null,
          extraction_qa_standardization_report = null,
          extraction_qa_validation_report = null,
          extraction_qa_refinement_count = 0,
          extraction_qa_validation_attempt_count = 0,
          extraction_qa_validated_at = null
        where story_id = p_story_id and chunk_index = p_chunk_index;
        get diagnostics v_chunks_reset = row_count;
      else
        for v_rec in
          select a.id, a.input_snapshot, a.report, a.claim_version_id
          from public.story_extraction_qa_artifacts a
          where a.story_id = p_story_id
            and a.chunk_index = p_chunk_index
            and a.stage = 'chunk_review_claims'
            and (
              (v_latest_run_id is not null and a.run_id = v_latest_run_id)
              or (v_latest_run_id is null and a.created_at = v_latest_run_at)
            )
        loop
          update public.chunk_claim_versions ccv
          set review_outcome = null
          where ccv.id = coalesce(
            v_rec.claim_version_id,
            (v_rec.report->>'reviewed_claim_version_id')::uuid
          );

          select a.report into v_prior_report
          from public.story_extraction_qa_artifacts a
          where a.story_id = p_story_id
            and a.chunk_index = p_chunk_index
            and a.stage = 'chunk_review_claims'
            and a.created_at < v_latest_run_at
            and a.reverted_at is null
          order by a.created_at desc
          limit 1;

          if v_prior_report is null then
            update public.story_chunks sc
            set
              extraction_json = coalesce(v_rec.input_snapshot, sc.extraction_json),
              active_claim_version_id = coalesce(v_rec.claim_version_id, sc.active_claim_version_id),
              extraction_qa_status = 'pending',
              extraction_qa_review_report = null,
              extraction_qa_standardization_report = null,
              extraction_qa_validation_report = null,
              extraction_qa_validation_attempt_count = 0,
              extraction_qa_validated_at = null
            where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
          else
            v_attempt_number := coalesce((v_prior_report->>'attempt_number')::int, 1);
            v_status := public.revert_qa_status_from_review_report(v_prior_report, v_attempt_number);

            update public.story_chunks sc
            set
              extraction_json = coalesce(v_rec.input_snapshot, sc.extraction_json),
              active_claim_version_id = coalesce(v_rec.claim_version_id, sc.active_claim_version_id),
              extraction_qa_status = v_status,
              extraction_qa_review_report = v_prior_report,
              extraction_qa_validation_report = jsonb_build_object(
                'passes', v_status = 'passed',
                'recommended_status', v_status,
                'summary', v_prior_report->>'summary',
                'attempt_number', v_attempt_number,
                'deterministic_issues', coalesce(v_prior_report->'deterministic_issues', '[]'::jsonb)
              ),
              extraction_qa_validation_attempt_count = v_attempt_number,
              extraction_qa_validated_at = case
                when v_status in ('passed', 'needs_human_review') then now()
                else null
              end
            where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
          end if;
          v_chunks_reset := v_chunks_reset + 1;
        end loop;

        update public.story_extraction_qa_artifacts
        set reverted_at = now()
        where story_id = p_story_id
          and chunk_index = p_chunk_index
          and stage = 'chunk_review_claims'
          and reverted_at is null
          and (
            (v_latest_run_id is not null and run_id = v_latest_run_id)
            or (v_latest_run_id is null and created_at = v_latest_run_at)
          );
      end if;

    when 'validate-chunk-positions' then
      select a.run_id, a.created_at
      into v_latest_run_id, v_latest_run_at
      from public.story_extraction_qa_artifacts a
      where a.story_id = p_story_id
        and a.chunk_index = p_chunk_index
        and a.stage = 'chunk_review_positions'
      order by a.created_at desc
      limit 1;

      if v_latest_run_at is null then
        if not exists (
          select 1 from public.story_chunks sc
          where sc.story_id = p_story_id
            and sc.chunk_index = p_chunk_index
            and sc.positions_qa_review_report is not null
        ) then
          raise exception 'Step not executed: validate-chunk-positions for chunk %', p_chunk_index;
        end if;

        update public.story_chunks
        set
          positions_qa_status = 'pending',
          positions_qa_review_report = null,
          positions_qa_validation_report = null,
          positions_qa_refinement_count = 0,
          positions_qa_validation_attempt_count = 0,
          positions_qa_validated_at = null
        where story_id = p_story_id and chunk_index = p_chunk_index;
        get diagnostics v_chunks_reset = row_count;
      else
        for v_rec in
          select a.id, a.input_snapshot, a.report
          from public.story_extraction_qa_artifacts a
          where a.story_id = p_story_id
            and a.chunk_index = p_chunk_index
            and a.stage = 'chunk_review_positions'
            and (
              (v_latest_run_id is not null and a.run_id = v_latest_run_id)
              or (v_latest_run_id is null and a.created_at = v_latest_run_at)
            )
        loop
          select a.report into v_prior_report
          from public.story_extraction_qa_artifacts a
          where a.story_id = p_story_id
            and a.chunk_index = p_chunk_index
            and a.stage = 'chunk_review_positions'
            and a.created_at < v_latest_run_at
          order by a.created_at desc
          limit 1;

          if v_prior_report is null then
            update public.story_chunks sc
            set
              positions_extraction_json = coalesce(v_rec.input_snapshot, sc.positions_extraction_json),
              positions_qa_status = 'pending',
              positions_qa_review_report = null,
              positions_qa_validation_report = null,
              positions_qa_validation_attempt_count = 0,
              positions_qa_validated_at = null
            where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
          else
            v_attempt_number := coalesce((v_prior_report->>'attempt_number')::int, 1);
            v_status := public.revert_qa_status_from_review_report(v_prior_report, v_attempt_number);

            update public.story_chunks sc
            set
              positions_extraction_json = coalesce(v_rec.input_snapshot, sc.positions_extraction_json),
              positions_qa_status = v_status,
              positions_qa_review_report = v_prior_report,
              positions_qa_validation_report = jsonb_build_object(
                'passes', v_status = 'passed',
                'recommended_status', v_status,
                'summary', v_prior_report->>'summary',
                'attempt_number', v_attempt_number,
                'deterministic_issues', coalesce(v_prior_report->'deterministic_issues', '[]'::jsonb)
              ),
              positions_qa_validation_attempt_count = v_attempt_number,
              positions_qa_validated_at = case
                when v_status in ('passed', 'needs_human_review') then now()
                else null
              end
            where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
          end if;
          v_chunks_reset := v_chunks_reset + 1;
        end loop;

        delete from public.story_extraction_qa_artifacts
        where story_id = p_story_id
          and chunk_index = p_chunk_index
          and stage = 'chunk_review_positions'
          and (
            (v_latest_run_id is not null and run_id = v_latest_run_id)
            or (v_latest_run_id is null and created_at = v_latest_run_at)
          );
      end if;

    else
      raise exception 'Unhandled chunk revert step: %', p_step_id;
  end case;

  if p_actor_id is not null then
    perform public.append_story_audit_event(
      p_story_id,
      'admin_action',
      'Chunk pipeline step reverted',
      p_step_id,
      jsonb_build_object(
        'step_id', p_step_id,
        'chunk_index', p_chunk_index,
        'chunks_reset', v_chunks_reset
      ),
      p_actor_id,
      'api:revert-step'
    );
  end if;

  delete from public.story_step_runs
  where story_id = p_story_id
    and step_id = p_step_id
    and chunk_index = p_chunk_index;

  return jsonb_build_object(
    'step_id', p_step_id,
    'chunk_index', p_chunk_index,
    'chunks_reset', v_chunks_reset
  );
end;
$$;

comment on function public.revert_chunk_pipeline_step(uuid, text, int, uuid) is
  'Revert one chunk-layer pipeline step for a single story chunk (admin chunk agent flow).';


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

      DELETE FROM public.chunk_claim_versions
      WHERE story_id = p_story_id;

      UPDATE public.story_chunks
      SET
        extraction_json = null,
        active_claim_version_id = null,
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
        AND a.reverted_at IS NULL
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_latest_run_at IS NULL THEN
        RAISE EXCEPTION 'Step not executed: refine-chunk-claims';
      END IF;

      FOR v_rec IN
        SELECT
          a.chunk_index,
          a.output_claim_version_id,
          a.input_claim_version_id,
          a.input_snapshot,
          cv.parent_version_id,
          cv.created_from_review_artifact_id
        FROM public.story_extraction_qa_artifacts a
        LEFT JOIN public.chunk_claim_versions cv
          ON cv.id = a.output_claim_version_id
        WHERE a.story_id = p_story_id
          AND a.stage = 'chunk_refine_claims'
          AND a.reverted_at IS NULL
          AND (
            (v_latest_run_id IS NOT NULL AND a.run_id = v_latest_run_id)
            OR (v_latest_run_id IS NULL AND a.created_at = v_latest_run_at)
          )
      LOOP
        IF v_rec.parent_version_id IS NOT NULL THEN
          SELECT a.report
          INTO v_prior_report
          FROM public.story_extraction_qa_artifacts a
          WHERE a.id = v_rec.created_from_review_artifact_id;

          UPDATE public.story_chunks sc
          SET
            active_claim_version_id = v_rec.parent_version_id,
            extraction_json = (
              SELECT ccv.claims_json
              FROM public.chunk_claim_versions ccv
              WHERE ccv.id = v_rec.parent_version_id
            ),
            extraction_qa_refinement_count = GREATEST(0, COALESCE(sc.extraction_qa_refinement_count, 0) - 1),
            extraction_qa_status = 'needs_refinement',
            extraction_qa_validated_at = null,
            extraction_qa_review_report = COALESCE(v_prior_report, sc.extraction_qa_review_report),
            extraction_qa_validation_report = CASE
              WHEN v_prior_report IS NOT NULL THEN jsonb_build_object(
                'passes', false,
                'recommended_status', 'needs_refinement',
                'summary', v_prior_report->>'summary',
                'attempt_number', COALESCE((v_prior_report->>'attempt_number')::int, 1),
                'deterministic_issues', COALESCE(v_prior_report->'deterministic_issues', '[]'::jsonb)
              )
              ELSE sc.extraction_qa_validation_report
            END
          WHERE sc.story_id = p_story_id
            AND sc.chunk_index = v_rec.chunk_index;
        ELSE
          UPDATE public.story_chunks sc
          SET
            extraction_json = COALESCE(v_rec.input_snapshot, sc.extraction_json),
            active_claim_version_id = COALESCE(v_rec.input_claim_version_id, sc.active_claim_version_id),
            extraction_qa_refinement_count = GREATEST(0, COALESCE(sc.extraction_qa_refinement_count, 0) - 1),
            extraction_qa_status = 'needs_refinement',
            extraction_qa_validated_at = null
          WHERE sc.story_id = p_story_id
            AND sc.chunk_index = v_rec.chunk_index;
        END IF;

        IF v_rec.output_claim_version_id IS NOT NULL THEN
          PERFORM public.delete_refiner_claim_version(v_rec.output_claim_version_id);
        END IF;

        v_chunks_reset := v_chunks_reset + 1;
      END LOOP;

      UPDATE public.story_extraction_qa_artifacts
      SET reverted_at = now()
      WHERE story_id = p_story_id
        AND stage = 'chunk_refine_claims'
        AND reverted_at IS NULL
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
        AND a.reverted_at IS NULL
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF v_latest_run_at IS NULL THEN
        IF NOT v_chunk_claims_review_started THEN
          RAISE EXCEPTION 'Step not executed: validate-chunk-claims';
        END IF;

        UPDATE public.chunk_claim_versions ccv
        SET review_outcome = null
        WHERE ccv.story_id = p_story_id;

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
      ELSE
        FOR v_rec IN
          SELECT a.id, a.chunk_index, a.input_snapshot, a.report, a.created_at, a.claim_version_id
          FROM public.story_extraction_qa_artifacts a
          WHERE a.story_id = p_story_id
            AND a.stage = 'chunk_review_claims'
            AND (
              (v_latest_run_id IS NOT NULL AND a.run_id = v_latest_run_id)
              OR (v_latest_run_id IS NULL AND a.created_at = v_latest_run_at)
            )
        LOOP
          UPDATE public.chunk_claim_versions ccv
          SET review_outcome = null
          WHERE ccv.id = COALESCE(
            v_rec.claim_version_id,
            (v_rec.report->>'reviewed_claim_version_id')::uuid
          );

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
              active_claim_version_id = COALESCE(v_rec.claim_version_id, sc.active_claim_version_id),
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
              active_claim_version_id = COALESCE(v_rec.claim_version_id, sc.active_claim_version_id),
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

        UPDATE public.story_extraction_qa_artifacts
        SET reverted_at = now()
        WHERE story_id = p_story_id
          AND stage = 'chunk_review_claims'
          AND reverted_at IS NULL
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
  'Reverts one pipeline step. Refine undo deletes refiner output claim versions.';

COMMENT ON FUNCTION public.revert_chunk_pipeline_step(uuid, text, int, uuid) IS
  'Revert one chunk-layer pipeline step for a single story chunk (admin chunk agent flow). Refine undo deletes refiner output versions.';

