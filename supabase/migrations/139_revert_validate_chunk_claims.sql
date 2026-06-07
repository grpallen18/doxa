-- Extend revert_story_pipeline_step through validate-chunk-claims.

create or replace function public.revert_story_pipeline_step(
  p_story_id uuid,
  p_step_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_chunk_claims_validated boolean := false;
  v_merge_or_canonical_progress boolean := false;
begin
  if not exists (select 1 from public.stories s where s.story_id = p_story_id) then
    raise exception 'Story not found: %', p_story_id;
  end if;

  if p_step_id is null or not (p_step_id = any (v_allowed)) then
    raise exception 'Unsupported revert step: %', coalesce(p_step_id, '(null)');
  end if;

  select
    exists (select 1 from public.story_chunks sc where sc.story_id = p_story_id)
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = p_story_id
        and (
          sc.extraction_json is null
          or coalesce(sc.extraction_qa_status, 'pending') not in ('passed', 'atoms_passed')
        )
    )
  into v_chunk_claims_validated;

  v_merge_or_canonical_progress :=
    exists (select 1 from public.story_claims sc where sc.story_id = p_story_id)
    or exists (select 1 from public.story_evidence se where se.story_id = p_story_id)
    or exists (select 1 from public.story_positions sp where sp.story_id = p_story_id)
    or exists (select 1 from public.story_events sev where sev.story_id = p_story_id)
    or exists (
      select 1 from public.stories s
      where s.story_id = p_story_id
        and (
          s.merged_at is not null
          or s.extraction_qa_status is not null
        )
    )
    or exists (
      select 1 from public.story_claims sc
      where sc.story_id = p_story_id
        and sc.claim_id is not null
    )
    or exists (
      select 1 from public.story_events se
      where se.story_id = p_story_id
        and se.event_id is not null
    )
    or exists (
      select 1 from public.story_positions sp
      where sp.story_id = p_story_id
        and sp.canonical_position_id is not null
    );

  if v_merge_or_canonical_progress then
    raise exception
      'Cannot revert: later merge or canonical steps have progress. Use Clear extraction first.';
  end if;

  if v_chunk_claims_validated
    and p_step_id = any (v_pre_validate)
  then
    raise exception
      'Cannot revert: chunk claims review is complete. Revert validate-chunk-claims first.';
  end if;

  select exists (select 1 from public.story_bodies sb where sb.story_id = p_story_id)
  into v_has_body;

  select exists (
    select 1
    from public.story_bodies sb
    where sb.story_id = p_story_id
      and sb.content_clean is not null
      and length(trim(sb.content_clean)) > 0
  )
  into v_has_clean;

  select count(*)::int,
         count(*) filter (where sc.extraction_json is not null)::int
  into v_chunk_count, v_extracted_count
  from public.story_chunks sc
  where sc.story_id = p_story_id;

  case p_step_id
    when 'relevance-gate' then
      if not exists (
        select 1 from public.stories s
        where s.story_id = p_story_id
          and s.relevance_ran_at is not null
      ) then
        raise exception 'Step not executed: relevance-gate';
      end if;

      if v_has_clean or v_has_body or v_chunk_count > 0 or v_extracted_count > 0 then
        raise exception 'Cannot revert qualification while later ingestion/extraction output exists';
      end if;

      update public.stories
      set
        relevance_ran_at = null,
        relevance_score = null,
        relevance_confidence = null,
        relevance_reason = null,
        relevance_tags = null,
        relevance_decision = null
      where story_id = p_story_id;

    when 'review-pending-stories' then
      if not exists (
        select 1 from public.stories s
        where s.story_id = p_story_id
          and s.pending_review_ran_at is not null
      ) then
        raise exception 'Step not executed: review-pending-stories';
      end if;

      if v_has_clean or v_has_body or v_chunk_count > 0 or v_extracted_count > 0 then
        raise exception 'Cannot revert pending review while later ingestion/extraction output exists';
      end if;

      update public.stories
      set
        pending_review_ran_at = null,
        relevance_tags = array_remove(coalesce(relevance_tags, array[]::text[]), 'unclear_after_review')
      where story_id = p_story_id;

    when 'scrape-story-content' then
      if not v_has_body then
        raise exception 'Step not executed: scrape-story-content';
      end if;

      if v_has_clean or v_chunk_count > 0 or v_extracted_count > 0 then
        raise exception 'Cannot revert scrape while clean/chunk/extract output exists';
      end if;

      delete from public.story_bodies where story_id = p_story_id;

      update public.stories
      set
        scrape_status = 'pending',
        scrape_error = null,
        scraped_at = null
      where story_id = p_story_id;

    when 'clean-scraped-content' then
      if not v_has_clean then
        raise exception 'Step not executed: clean-scraped-content';
      end if;

      if v_chunk_count > 0 or v_extracted_count > 0 then
        raise exception 'Cannot revert clean while chunk/extract output exists';
      end if;

      update public.story_bodies
      set content_clean = null
      where story_id = p_story_id;

      update public.stories
      set clean_completed_at = null
      where story_id = p_story_id;

    when 'chunk-story-bodies' then
      if v_chunk_count = 0 then
        raise exception 'Step not executed: chunk-story-bodies';
      end if;

      if v_extracted_count > 0 then
        raise exception 'Cannot revert chunk while extract output exists; revert extract first';
      end if;

      delete from public.story_chunks where story_id = p_story_id;
      get diagnostics v_chunks_deleted = row_count;

      update public.stories
      set
        extraction_completed_at = null,
        extraction_skipped_empty = false
      where story_id = p_story_id;

    when 'extract-story-claims' then
      if v_extracted_count = 0
        and not exists (
          select 1 from public.stories s
          where s.story_id = p_story_id
            and s.extraction_completed_at is not null
        )
      then
        raise exception 'Step not executed: extract-story-claims';
      end if;

      update public.story_chunks
      set
        extraction_json = null,
        extraction_completed_at = null,
        extraction_qa_status = null,
        extraction_qa_review_report = null,
        extraction_qa_standardization_report = null,
        extraction_qa_validation_report = null,
        extraction_qa_refinement_count = 0,
        extraction_qa_validation_attempt_count = 0,
        extraction_qa_validated_at = null
      where story_id = p_story_id;
      get diagnostics v_chunks_reset = row_count;

      update public.stories
      set
        extraction_completed_at = null,
        extraction_skipped_empty = false
      where story_id = p_story_id;

    when 'validate-chunk-claims' then
      if not v_chunk_claims_validated then
        raise exception 'Step not executed: validate-chunk-claims';
      end if;

      update public.story_chunks
      set
        extraction_qa_status = 'pending',
        extraction_qa_validation_report = null,
        extraction_qa_validated_at = null,
        extraction_qa_validation_attempt_count = 0
      where story_id = p_story_id
        and extraction_json is not null;
      get diagnostics v_chunks_reset = row_count;

      delete from public.story_extraction_qa_artifacts
      where story_id = p_story_id
        and stage in ('chunk_validate_claims', 'chunk_validate');

    else
      raise exception 'Unsupported revert step: %', p_step_id;
  end case;

  return jsonb_build_object(
    'story_id', p_story_id,
    'step_id', p_step_id,
    'chunks_deleted', v_chunks_deleted,
    'chunks_reset', v_chunks_reset
  );
end;
$$;

comment on function public.revert_story_pipeline_step(uuid, text) is
  'Admin: revert one story pipeline step (ingestion through review chunk claims).';

revoke all on function public.revert_story_pipeline_step(uuid, text) from public;
grant execute on function public.revert_story_pipeline_step(uuid, text) to service_role;
