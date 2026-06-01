-- Claims-only chunk validation queue stage.

set search_path = public, extensions;

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
      or (p_stage = 'validate_claims'
          and sc.extraction_qa_status = 'pending')
      or (p_stage = 'refine'
          and sc.extraction_qa_status = 'needs_refinement'
          and sc.extraction_qa_refinement_count < 3
          and sc.extraction_qa_validation_attempt_count < 3)
      or (p_stage = 'validate'
          and sc.extraction_qa_status in ('standardized', 'refined')
          and sc.extraction_qa_validated_at is null)
      or (p_stage = 'link' and sc.extraction_qa_status = 'atoms_passed')
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_chunks_ready_for_chunk_qa(text, int) is
  'Queue for chunk extraction QA: standardize | validate_claims | refine | validate | link.';
