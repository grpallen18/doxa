-- Extraction QA pipeline: chunk + story quality gates before merge and canonicalization.

set search_path = public, extensions;

-- Shared QA status on chunks and stories
alter table public.story_chunks
  add column if not exists extraction_qa_status text
    check (extraction_qa_status in (
      'pending', 'reviewed', 'needs_refinement', 'refined', 'passed', 'needs_human_review'
    )),
  add column if not exists extraction_qa_review_report jsonb,
  add column if not exists extraction_qa_validation_report jsonb,
  add column if not exists extraction_qa_refinement_count int not null default 0,
  add column if not exists extraction_qa_validated_at timestamptz;

comment on column public.story_chunks.extraction_qa_status is
  'Chunk extraction QA state machine; pending after extract, passed required before merge.';

alter table public.stories
  add column if not exists extraction_qa_status text
    check (extraction_qa_status in (
      'pending', 'reviewed', 'needs_refinement', 'refined', 'passed', 'needs_human_review'
    )),
  add column if not exists extraction_qa_review_report jsonb,
  add column if not exists extraction_qa_validation_report jsonb,
  add column if not exists extraction_qa_refinement_count int not null default 0,
  add column if not exists extraction_qa_validated_at timestamptz;

comment on column public.stories.extraction_qa_status is
  'Story-level merge QA state; passed required before canonical linkers run.';

create index if not exists idx_story_chunks_extraction_qa_status
  on public.story_chunks (extraction_qa_status)
  where extraction_qa_status is not null;

create index if not exists idx_stories_extraction_qa_status
  on public.stories (extraction_qa_status)
  where extraction_qa_status is not null;

-- Append-only QA artifacts for eval dataset
create table if not exists public.story_extraction_qa_artifacts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(story_id) on delete cascade,
  chunk_index int,
  stage text not null,
  input_snapshot jsonb,
  output_snapshot jsonb,
  report jsonb,
  run_id uuid references public.pipeline_runs(run_id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.story_extraction_qa_artifacts is
  'Append-only extraction QA snapshots and reports per chunk/story stage.';

create index if not exists idx_story_extraction_qa_artifacts_story
  on public.story_extraction_qa_artifacts (story_id, created_at desc);

alter table public.story_extraction_qa_artifacts enable row level security;

-- Extend human feedback from 126
alter table public.story_extraction_feedback
  add column if not exists issue_types text[],
  add column if not exists pipeline_stage text check (pipeline_stage is null or pipeline_stage in ('chunk', 'merge')),
  add column if not exists chunk_index int;

-- Backfill: do not block in-flight extractions or merged stories
update public.story_chunks
set extraction_qa_status = 'passed'
where extraction_json is not null
  and extraction_qa_status is null;

update public.stories
set extraction_qa_status = 'passed'
where merged_at is not null
  and extraction_qa_status is null;

-- Merge readiness: all chunks extracted AND chunk QA passed
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
        and coalesce(sc.extraction_qa_status, 'pending') <> 'passed'
    )
    and not exists (select 1 from public.story_claims sc where sc.story_id = s.story_id)
    and not exists (select 1 from public.story_positions sp where sp.story_id = s.story_id)
    and not exists (select 1 from public.story_events se where se.story_id = s.story_id)
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_stories_ready_to_merge(int) is
  'Returns story_ids ready for merge_story_entities (all chunks extracted + chunk QA passed, no story-level entities yet).';

-- Chunk QA queue by stage
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
      (p_stage = 'review' and sc.extraction_qa_status = 'pending')
      or (p_stage = 'refine'
          and sc.extraction_qa_status = 'needs_refinement'
          and sc.extraction_qa_refinement_count < 1)
      or (p_stage = 'validate'
          and sc.extraction_qa_status in ('reviewed', 'refined')
          and sc.extraction_qa_validated_at is null)
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_chunks_ready_for_chunk_qa(text, int) is
  'Queue for chunk extraction QA steps: review | refine | validate.';

-- Story merge QA queue by stage
create or replace function public.get_stories_ready_for_merge_qa(p_stage text, p_limit int default 1)
returns table (story_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.story_id
  from public.stories s
  where s.merged_at is not null
    and (
      (p_stage = 'review' and s.extraction_qa_status = 'pending')
      or (p_stage = 'refine'
          and s.extraction_qa_status = 'needs_refinement'
          and s.extraction_qa_refinement_count < 1)
      or (p_stage = 'validate'
          and s.extraction_qa_status in ('reviewed', 'refined')
          and s.extraction_qa_validated_at is null)
    )
  order by s.merged_at asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_stories_ready_for_merge_qa(text, int) is
  'Queue for merged extraction QA steps: review | refine | validate.';

-- Gate update_stances on story QA passed
create or replace function public.get_story_claims_needing_stance(p_limit int default 1)
returns table (
  story_claim_id uuid,
  story_id uuid,
  raw_text text,
  content_clean text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sc.story_claim_id,
    sc.story_id,
    sc.raw_text,
    sb.content_clean
  from public.story_claims sc
  join public.story_bodies sb on sb.story_id = sc.story_id
  join public.stories s on s.story_id = sc.story_id
  where sc.stance is null
    and sb.content_clean is not null
    and coalesce(s.extraction_qa_status, 'passed') = 'passed'
  order by sc.created_at asc
  limit p_limit;
$$;

comment on function public.get_story_claims_needing_stance(int) is
  'Returns story_claims needing stance backfill; only stories with extraction_qa_status passed.';
