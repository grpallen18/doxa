-- RPCs for review_pending_stories and merge_story_claims.
-- Avoids PostgREST default row limits by selecting only rows that need processing.

-- review_pending_stories: PENDING stories that have content_clean, ready for re-review.
create or replace function public.get_pending_stories_with_body(p_since timestamptz, p_limit int default 10)
returns table (
  story_id uuid,
  title text,
  content_snippet text,
  content_full text,
  url text,
  created_at timestamptz,
  source_name text,
  body_content text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.story_id,
    s.title,
    s.content_snippet,
    s.content_full,
    s.url,
    s.created_at,
    src.name as source_name,
    sb.content_clean as body_content
  from public.stories s
  join public.story_bodies sb on sb.story_id = s.story_id
  join public.sources src on src.source_id = s.source_id
  where s.relevance_status = 'PENDING'
    and s.being_processed = false
    and s.created_at >= p_since
    and sb.content_clean is not null
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_pending_stories_with_body(timestamptz, int) is 'Returns PENDING stories with content_clean for review_pending_stories. Ordered by created_at asc.';

-- merge_story_claims: story_ids ready to merge (all chunks have extraction_json, no story_claims yet).
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
    and not exists (select 1 from public.story_claims sc where sc.story_id = s.story_id)
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_stories_ready_to_merge(int) is 'Returns story_ids ready for merge_story_claims (all chunks extracted, no claims yet). Ordered by created_at asc.';
