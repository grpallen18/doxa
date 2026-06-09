-- Refine queue: include misclassified needs_human_review rows that still have refinable review findings.

create or replace function public.get_chunks_ready_for_positions_qa(p_stage text, p_limit int default 5)
returns table (story_id uuid, chunk_index int, content text, positions_extraction_json jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select sc.story_id, sc.chunk_index, sc.content, sc.positions_extraction_json
  from public.story_chunks sc
  where sc.positions_extraction_json is not null
    and (
      (p_stage = 'validate_positions'
          and sc.positions_qa_status = 'pending')
      or (
        p_stage = 'refine_positions'
        and sc.positions_qa_refinement_count < 3
        and sc.positions_qa_validation_attempt_count < 3
        and (
          sc.positions_qa_status = 'needs_refinement'
          or (
            sc.positions_qa_status = 'needs_human_review'
            and (
              sc.positions_qa_review_report->>'recommended_action' = 'needs_refinement'
              or jsonb_array_length(coalesce(sc.positions_qa_review_report->'patches', '[]'::jsonb)) > 0
              or exists (
                select 1
                from jsonb_array_elements(coalesce(sc.positions_qa_review_report->'issues', '[]'::jsonb)) issue
                where issue->>'severity' in ('blocking', 'major')
              )
            )
          )
        )
      )
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_chunks_ready_for_positions_qa(text, int) is
  'Queue for positions-only chunk QA: validate_positions | refine_positions.';
