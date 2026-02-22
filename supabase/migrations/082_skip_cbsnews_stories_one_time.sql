-- One-time: skip all cbsnews.com stories. CBS blocks scraping; mark as skipped so backlog moves.
update public.stories
set scrape_skipped = true, scrape_fail_count = 3, scrape_skipped_at = now()
where lower(url) like '%cbsnews.com%'
  and (scrape_skipped = false or scrape_skipped is null);

-- Exclude cbsnews.com from scrape selection going forward (belt-and-suspenders).
drop function if exists public.get_stories_ready_for_scrape(int);
create or replace function public.get_stories_ready_for_scrape(p_limit int default 1)
returns table (story_id uuid, url text)
language sql
volatile
security definer
set search_path = public
as $$
  with eligible as (
    select s.story_id, s.url,
      lower(split_part(split_part(s.url, '://', 2), '/', 1)) as domain
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
      and lower(s.url) not like '%cbsnews.com%'
      and lower(split_part(split_part(s.url, '://', 2), '/', 1)) not in (
        select dt.domain from domain_throttle dt
        where dt.last_dispatched_at > now() - interval '3 minutes'
      )
  ),
  domain_counts as (
    select domain, count(*) as cnt
    from eligible
    group by domain
  ),
  top_domain as (
    select domain from domain_counts
    order by cnt desc
    limit 1
  )
  select e.story_id, e.url
  from eligible e
  where e.domain = (select domain from top_domain)
  order by random()
  limit p_limit;
$$;
