-- Restore domain throttle cooldown from 6 minutes to 15 minutes.
-- Reduces scrape frequency per domain to avoid rate limiting and CPU time limit errors.

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
