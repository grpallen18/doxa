-- Merge readiness: accept atoms_passed (legacy atom validation) or passed (claims validation).

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
    and not exists (select 1 from public.story_claims sc where sc.story_id = s.story_id)
    and not exists (select 1 from public.story_positions sp where sp.story_id = s.story_id)
    and not exists (select 1 from public.story_events se where se.story_id = s.story_id)
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_stories_ready_to_merge(int) is
  'Returns story_ids ready for merge_story_entities (all chunks extracted + chunk QA validated, no story-level entities yet).';
