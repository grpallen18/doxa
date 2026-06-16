-- Extend revert_chunk_pipeline_step for approve-chunk-claims + clear merge state on extract revert.

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
    'approve-chunk-claims',
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
        extraction_qa_validated_at = null,
        claims_merge_eligibility = jsonb_build_object(
          'parked', '[]'::jsonb,
          'repair_queue', '[]'::jsonb,
          'rejected_final', '[]'::jsonb,
          'pending_approval_claim_ids', '[]'::jsonb,
          'last_repair_version_id', null
        )
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


    when 'approve-chunk-claims' then
      select a.id, a.run_id, a.created_at, a.input_snapshot, a.report
      into v_rec
      from public.story_extraction_qa_artifacts a
      where a.story_id = p_story_id
        and a.chunk_index = p_chunk_index
        and a.stage = 'chunk_approve_claims'
        and a.reverted_at is null
      order by a.created_at desc
      limit 1;

      if v_rec.created_at is null then
        raise exception 'Step not executed: approve-chunk-claims for chunk %', p_chunk_index;
      end if;

      update public.story_extraction_qa_artifacts
      set reverted_at = now()
      where story_id = p_story_id
        and chunk_index = p_chunk_index
        and stage = 'chunk_approve_claims'
        and reverted_at is null
        and (
          (v_rec.run_id is not null and run_id = v_rec.run_id)
          or (v_rec.run_id is null and created_at = v_rec.created_at)
        );

      update public.story_chunks sc
      set
        extraction_qa_status = 'awaiting_approval',
        extraction_qa_validated_at = null,
        claims_merge_eligibility = jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(sc.claims_merge_eligibility, '{}'::jsonb),
              '{pending_approval_claim_ids}',
              coalesce(
                (
                  select jsonb_agg(elem->>'claim_id')
                  from jsonb_array_elements(coalesce(v_rec.input_snapshot->'claims', '[]'::jsonb)) elem
                  where elem ? 'claim_id'
                ),
                '[]'::jsonb
              ),
              true
            ),
            '{parked}',
            coalesce(
              (
                select jsonb_agg(p)
                from jsonb_array_elements(coalesce(sc.claims_merge_eligibility->'parked', '[]'::jsonb)) p
                where coalesce(p->>'parked_by', '') <> 'approval'
                  or coalesce(p->>'artifact_id', '') <> v_rec.id::text
              ),
              '[]'::jsonb
            ),
            true
          ),
          '{rejected_final}',
          coalesce(
            (
              select jsonb_agg(r)
              from jsonb_array_elements(coalesce(sc.claims_merge_eligibility->'rejected_final', '[]'::jsonb)) r
              where coalesce(r->>'artifact_id', '') <> v_rec.id::text
            ),
            '[]'::jsonb
          ),
          true
        )
      where sc.story_id = p_story_id and sc.chunk_index = p_chunk_index;
      get diagnostics v_chunks_reset = row_count;

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
          extraction_qa_validated_at = null,
          claims_merge_eligibility = jsonb_build_object(
            'parked', '[]'::jsonb,
            'repair_queue', '[]'::jsonb,
            'rejected_final', '[]'::jsonb,
            'pending_approval_claim_ids', '[]'::jsonb,
            'last_repair_version_id', null
          )
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
              extraction_qa_validated_at = null,
              claims_merge_eligibility = jsonb_build_object(
                'parked', '[]'::jsonb,
                'repair_queue', '[]'::jsonb,
                'rejected_final', '[]'::jsonb,
                'pending_approval_claim_ids', '[]'::jsonb,
                'last_repair_version_id', null
              )
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
              end,
              claims_merge_eligibility = jsonb_build_object(
                'parked', '[]'::jsonb,
                'repair_queue', '[]'::jsonb,
                'rejected_final', '[]'::jsonb,
                'pending_approval_claim_ids', '[]'::jsonb,
                'last_repair_version_id', null
              )
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
