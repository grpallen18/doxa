-- Chunk extraction QA: atoms_passed status + link step queue.

set search_path = public, extensions;

alter table public.story_chunks drop constraint if exists story_chunks_extraction_qa_status_check;

alter table public.story_chunks
  add constraint story_chunks_extraction_qa_status_check
    check (extraction_qa_status in (
      'pending', 'reviewed', 'needs_refinement', 'refined', 'atoms_passed', 'passed', 'needs_human_review'
    ));

comment on column public.story_chunks.extraction_qa_status is
  'Chunk QA: pending -> reviewed/refined -> atoms_passed (validate) -> passed (link) -> merge.';

comment on column public.story_chunks.extraction_json is
  'Phase A: claims, evidence, positions, events with provenance. Phase B adds *_links arrays via link_chunk_entities.';

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
      or (p_stage = 'link' and sc.extraction_qa_status = 'atoms_passed')
    )
  order by sc.story_id asc, sc.chunk_index asc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_chunks_ready_for_chunk_qa(text, int) is
  'Queue for chunk extraction QA: review | refine | validate | link.';

alter table public.story_claims
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column public.story_claims.metadata is
  'Extraction provenance and auxiliary fields (source_excerpt, source_chunk_index).';
