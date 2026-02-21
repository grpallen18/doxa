-- Pick a random eligible story instead of the oldest.
-- Avoids repeatedly retrying the same story when it consistently fails (e.g. CPU timeout).

create or replace function public.get_stories_ready_for_scrape(p_limit int default 1)
returns table (story_id uuid, url text)
language sql
volatile
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
  order by random()
  limit p_limit;
$$;
