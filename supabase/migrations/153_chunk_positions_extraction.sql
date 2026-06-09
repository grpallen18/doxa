-- Parallel positions extraction on story_chunks (independent of claims extraction_json).

set search_path = public, extensions;

alter table public.story_chunks
  add column if not exists positions_extraction_json jsonb,
  add column if not exists positions_extraction_completed_at timestamptz,
  add column if not exists positions_qa_status text
    check (positions_qa_status is null or positions_qa_status in (
      'pending', 'reviewed', 'needs_refinement', 'refined', 'passed', 'needs_human_review'
    )),
  add column if not exists positions_qa_review_report jsonb,
  add column if not exists positions_qa_validation_report jsonb,
  add column if not exists positions_qa_refinement_count int not null default 0,
  add column if not exists positions_qa_validation_attempt_count int not null default 0,
  add column if not exists positions_qa_validated_at timestamptz;

comment on column public.story_chunks.positions_extraction_json is
  'Chunk-level positions extraction: { positions: [...] }. Populated by extract_story_positions.';
comment on column public.story_chunks.positions_qa_status is
  'Positions-only chunk QA state; passed required before merge_story_positions.';

create index if not exists idx_story_chunks_positions_qa_status
  on public.story_chunks (positions_qa_status)
  where positions_qa_status is not null;

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
      or (p_stage = 'refine_positions'
          and sc.positions_qa_status = 'needs_refinement'
          and sc.positions_qa_refinement_count < 3
          and sc.positions_qa_validation_attempt_count < 3)
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_chunks_ready_for_positions_qa(text, int) is
  'Queue for positions-only chunk QA: validate_positions | refine_positions.';

create or replace function public.get_stories_ready_to_merge_positions(p_limit int default 1)
returns table (story_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.story_id
  from public.stories s
  where exists (select 1 from public.story_chunks sc where sc.story_id = s.story_id)
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id and sc.positions_extraction_json is null
    )
    and not exists (
      select 1 from public.story_chunks sc
      where sc.story_id = s.story_id
        and coalesce(sc.positions_qa_status, '') <> 'passed'
    )
    and not exists (select 1 from public.story_positions sp where sp.story_id = s.story_id)
  order by s.story_id asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_stories_ready_to_merge_positions(int) is
  'Stories with all chunks positions-extracted, positions QA passed, no story_positions yet.';
