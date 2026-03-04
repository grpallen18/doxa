-- 1. Mark stories with no URL as scrape_skipped (they cannot be scraped).
-- 2. Fix awaiting_scrape: include PENDING, include in-progress, use scraped_at (no rescrape of successful scrapes).
-- 3. Remove content_length_raw from get_stories_ready_for_scrape: successful scrape = done, no rescrape.

-- 1. One-time: mark stories with no URL as scrape_skipped
update stories
set scrape_skipped = true,
    scrape_skipped_at = coalesce(scrape_skipped_at, now())
where (url is null or trim(url) = '')
  and scrape_skipped = false;

-- 2. Update get_daily_health_report awaiting_scrape
drop function if exists public.get_daily_health_report();
create or replace function public.get_daily_health_report()
returns table (
  stories_ingested bigint,
  stories_approved bigint,
  stories_dropped bigint,
  stories_scraped bigint,
  stories_cleaned bigint,
  pending_stories_count bigint,
  chunks_created bigint,
  chunks_extracted bigint,
  merges_completed bigint,
  story_claims_created bigint,
  story_evidence_created bigint,
  claims_created bigint,
  awaiting_scrape bigint,
  awaiting_cleaning bigint,
  awaiting_merge bigint,
  unclassified_stories bigint,
  scrape_failed bigint,
  stuck_processing bigint,
  position_relationships_24h bigint,
  positions_24h bigint,
  controversies_24h bigint,
  viewpoints_24h bigint,
  positions_active bigint,
  controversies_active bigint,
  viewpoints_active bigint,
  scrape_total_24h bigint,
  scrape_successes_24h bigint,
  scrape_failures_24h bigint,
  stories_pending_24h bigint
)
language sql stable
security definer
set search_path = public, extensions
as $$
  with since as (select now() - interval '24 hours' as t)
  select
    (select count(*)::bigint from stories where created_at >= (select t from since)),
    (select count(*)::bigint from stories
     where relevance_ran_at >= (select t from since) and relevance_status = 'KEEP'),
    (select count(*)::bigint from stories
     where relevance_ran_at >= (select t from since) and relevance_status = 'DROP'),
    (select count(*)::bigint from stories where scraped_at >= (select t from since)),
    (select count(*)::bigint from story_bodies where cleaned_at >= (select t from since)),
    (select count(*)::bigint from stories where relevance_status = 'PENDING'),
    (select count(*)::bigint from story_chunks where created_at >= (select t from since)),
    (select count(*)::bigint from story_chunks
     where extraction_completed_at >= (select t from since)),
    (select count(*)::bigint from stories where merged_at >= (select t from since)),
    (select count(*)::bigint from story_claims where created_at >= (select t from since)),
    (select count(*)::bigint from story_evidence where created_at >= (select t from since)),
    (select count(*)::bigint from claims where created_at >= (select t from since)),
    (select count(*)::bigint from stories s
     where s.relevance_status in ('KEEP', 'PENDING')
       and s.scrape_skipped = false
       and s.scraped_at is null
       and s.url is not null
       and trim(s.url) <> ''
       and s.url like '%://%'),
    (select count(*)::bigint from story_bodies where cleaned_at is null),
    (select count(*)::bigint from stories s
     where s.merged_at is null
     and exists (select 1 from story_chunks sc where sc.story_id = s.story_id)
     and not exists (select 1 from story_chunks sc where sc.story_id = s.story_id and sc.extraction_json is null)
     and not exists (select 1 from story_claims sc where sc.story_id = s.story_id)),
    (select count(*)::bigint from stories where relevance_status is null),
    (select count(*)::bigint from stories where scrape_skipped = true and scrape_skipped_at >= (select t from since)),
    (select count(*)::bigint from stories where being_processed = true),
    (select count(*)::bigint from position_relationships where classified_at >= (select t from since)),
    (select count(*)::bigint from agreement_clusters where created_at >= (select t from since)),
    (select count(*)::bigint from controversy_clusters where created_at >= (select t from since)),
    (select count(*)::bigint from controversy_viewpoints where created_at >= (select t from since)),
    (select count(*)::bigint from agreement_clusters where status = 'active'),
    (select count(*)::bigint from controversy_clusters where status = 'active'),
    (select count(*)::bigint from controversy_viewpoints cv
     join controversy_clusters cc on cv.controversy_cluster_id = cc.controversy_cluster_id
     where cc.status = 'active'),
    (select count(*)::bigint from scrape_log where created_at >= (select t from since)),
    (select count(*)::bigint from scrape_log where outcome = 'success' and created_at >= (select t from since)),
    (select count(*)::bigint from scrape_log where outcome = 'failure' and created_at >= (select t from since)),
    (select count(*)::bigint from stories
     where relevance_ran_at >= (select t from since) and relevance_status = 'PENDING');
$$;

-- 3. Remove content_length_raw from get_stories_ready_for_scrape (successful scrape = done, no rescrape)
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
    where s.relevance_status in ('KEEP', 'PENDING')
      and s.being_processed = false
      and s.scrape_skipped = false
      and s.scraped_at is null
      and s.url is not null
      and trim(s.url) <> ''
      and s.url like '%://%'
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
