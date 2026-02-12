-- RPC for chunk_story_bodies: returns story_bodies with content_clean that have no story_chunks yet.
-- Fixes the "oldest 100" limit bug where new unchunked stories were never seen.

create or replace function public.get_unchunked_story_bodies(p_limit int default 10)
returns table (
  story_id uuid,
  content_clean text
)
language sql
stable
security definer
set search_path = public
as $$
  select sb.story_id, sb.content_clean
  from public.story_bodies sb
  where sb.content_clean is not null
    and not exists (
      select 1 from public.story_chunks sc where sc.story_id = sb.story_id
    )
  order by sb.scraped_at asc
  limit p_limit;
$$;

comment on function public.get_unchunked_story_bodies(int) is 'Returns unchunked story_bodies (content_clean not null, no story_chunks) for chunk_story_bodies. Ordered by scraped_at asc.';
