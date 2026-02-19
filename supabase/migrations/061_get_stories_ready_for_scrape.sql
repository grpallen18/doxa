-- RPC: Stories ready for scrape, excluding domains on cooldown.
-- Used by scrape_story_content to avoid "No story outside domain cooldown" when oldest stories are from throttled domains.

create or replace function public.get_stories_ready_for_scrape(p_limit int default 1)
returns table (story_id uuid, url text)
language sql
stable
security definer
set search_path = public
as $$
  select s.story_id, s.url
  from stories s
  left join story_bodies sb on sb.story_id = s.story_id
  where s.relevance_status in ('KEEP', 'PENDING')
    and s.being_processed = false
    and s.scrape_skipped = false
    and s.scraped_at is null
    and s.url is not null
    and trim(s.url) <> ''
    and coalesce(sb.content_length_raw, 0) < 500
    and s.url like '%://%'
    and lower(split_part(split_part(s.url, '://', 2), '/', 1)) not in (
      select dt.domain from domain_throttle dt
      where dt.last_dispatched_at > now() - interval '15 minutes'
    )
  order by s.created_at asc
  limit p_limit;
$$;

comment on function public.get_stories_ready_for_scrape(int) is 'Returns stories needing scrape whose domain is not on cooldown. Used by scrape_story_content.';
