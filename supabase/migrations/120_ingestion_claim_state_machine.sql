-- Ingestion: replace being_processed lock/unlock with atomic claim timestamps.
-- scrape_dispatched_at: in-flight scrape (cleared on receive or stale release).
-- relevance_claimed_at: in-flight relevance_gate batch.
-- review_claimed_at: in-flight review_pending_stories batch.

alter table public.stories
  add column if not exists scrape_dispatched_at timestamptz,
  add column if not exists relevance_claimed_at timestamptz,
  add column if not exists review_claimed_at timestamptz;

comment on column public.stories.scrape_dispatched_at is 'Set when scrape_story_content dispatches to the worker; cleared on receive or stale release.';
comment on column public.stories.relevance_claimed_at is 'Set when relevance_gate atomically claims a row; cleared when relevance_ran_at is written or claim goes stale.';
comment on column public.stories.review_claimed_at is 'Set when review_pending_stories claims a row; cleared when review completes or claim goes stale.';

-- Clear orphaned relevance locks (LLM crash / edge timeout).
create or replace function public.release_stale_relevance_claims()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with updated as (
    update public.stories
    set relevance_claimed_at = null
    where relevance_claimed_at is not null
      and relevance_ran_at is null
      and relevance_claimed_at < now() - interval '30 minutes'
    returning 1
  )
  select count(*)::int into n from updated;
  return n;
end;
$$;

-- Clear orphaned review locks.
create or replace function public.release_stale_review_claims()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with updated as (
    update public.stories
    set review_claimed_at = null
    where review_claimed_at is not null
      and review_claimed_at < now() - interval '30 minutes'
    returning 1
  )
  select count(*)::int into n from updated;
  return n;
end;
$$;

-- Abandoned scrape dispatches: release and count as a failure (same as increment_scrape_fail).
create or replace function public.release_stale_scrape_dispatches()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with updated as (
    update public.stories s
    set
      scrape_dispatched_at = null,
      scrape_fail_count = s.scrape_fail_count + 1,
      scrape_skipped = (s.scrape_fail_count + 1 >= 3),
      scrape_skipped_at = case
        when (s.scrape_fail_count + 1 >= 3) then coalesce(s.scrape_skipped_at, now())
        else s.scrape_skipped_at
      end,
      relevance_score = case
        when (s.scrape_fail_count + 1 >= 3)
          and (s.relevance_score is null or (coalesce(s.relevance_confidence, 0) < 60 and coalesce(s.relevance_score, 0) >= 50))
        then 0
        else s.relevance_score
      end,
      relevance_confidence = case
        when (s.scrape_fail_count + 1 >= 3)
          and (s.relevance_score is null or (coalesce(s.relevance_confidence, 0) < 60 and coalesce(s.relevance_score, 0) >= 50))
        then 100
        else s.relevance_confidence
      end
    where s.scrape_dispatched_at is not null
      and s.scraped_at is null
      and not s.scrape_skipped
      and s.scrape_dispatched_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*)::int into n from updated;
  return n;
end;
$$;

comment on function public.release_stale_scrape_dispatches() is 'Releases scrape dispatches older than 15m with no scraped_at; increments scrape_fail_count (skip at 3, PENDING→DROP).';

-- DROP no-url rows still unclassified (not claimed).
create or replace function public.mark_no_url_stories_unclassified(p_since timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with updated as (
    update public.stories
    set
      relevance_score = 0,
      relevance_confidence = 100,
      relevance_reason = 'No URL; cannot scrape.',
      relevance_tags = array['no_url']::text[],
      relevance_model = coalesce(relevance_model, 'system'),
      relevance_ran_at = now(),
      relevance_claimed_at = null,
      scrape_skipped = true,
      scrape_skipped_at = coalesce(scrape_skipped_at, now())
    where relevance_status is null
      and relevance_claimed_at is null
      and created_at >= p_since
      and (url is null or trim(url) = '')
    returning 1
  )
  select count(*)::int into n from updated;
  return n;
end;
$$;

-- Atomically claim stories for relevance_gate.
create or replace function public.claim_stories_for_relevance(
  p_since timestamptz,
  p_limit int default 10
)
returns table (
  story_id uuid,
  title text,
  content_snippet text,
  content_full text,
  url text,
  created_at timestamptz,
  source_name text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.release_stale_relevance_claims();

  return query
  with to_claim as (
    select s.story_id
    from public.stories s
    where s.relevance_status is null
      and s.relevance_claimed_at is null
      and s.created_at >= p_since
      and s.url is not null
      and trim(s.url) <> ''
    order by s.created_at
    limit p_limit
    for update skip locked
  )
  update public.stories s
  set relevance_claimed_at = now()
  from to_claim tc
  where s.story_id = tc.story_id
  returning
    s.story_id,
    s.title,
    s.content_snippet,
    s.content_full,
    s.url,
    s.created_at,
    (select src.name from public.sources src where src.source_id = s.source_id);
end;
$$;

comment on function public.claim_stories_for_relevance(timestamptz, int) is 'Atomically claims unclassified stories with URLs for relevance_gate.';

-- Atomically claim and dispatch scrape (replaces select-then-lock).
create or replace function public.claim_stories_for_scrape(
  p_limit int default 1,
  p_dry_run boolean default false
)
returns table (story_id uuid, url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not p_dry_run then
    perform public.release_stale_scrape_dispatches();
  end if;

  if p_dry_run then
    return query
    with eligible as (
      select s.story_id, s.url,
        lower(split_part(split_part(s.url, '://', 2), '/', 1)) as domain
      from public.stories s
      where s.relevance_status in ('KEEP', 'PENDING')
        and s.scrape_dispatched_at is null
        and s.scrape_skipped = false
        and s.scraped_at is null
        and s.url is not null
        and trim(s.url) <> ''
        and s.url like '%://%'
        and lower(split_part(split_part(s.url, '://', 2), '/', 1)) not in (
          select dt.domain from public.domain_throttle dt
          where dt.last_dispatched_at > now() - interval '3 minutes'
        )
    ),
    domain_counts as (
      select domain, count(*) as cnt from eligible group by domain
    ),
    top_domain as (
      select domain from domain_counts order by cnt desc limit 1
    )
    select e.story_id, e.url
    from eligible e
    where e.domain = (select td.domain from top_domain td)
    order by random()
    limit p_limit;
    return;
  end if;

  return query
  with eligible as (
    select s.story_id, s.url,
      lower(split_part(split_part(s.url, '://', 2), '/', 1)) as domain
    from public.stories s
    where s.relevance_status in ('KEEP', 'PENDING')
      and s.scrape_dispatched_at is null
      and s.scrape_skipped = false
      and s.scraped_at is null
      and s.url is not null
      and trim(s.url) <> ''
      and s.url like '%://%'
      and lower(split_part(split_part(s.url, '://', 2), '/', 1)) not in (
        select dt.domain from public.domain_throttle dt
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
  ),
  picked as (
    select e.story_id, e.url
    from eligible e
    where e.domain = (select td.domain from top_domain td)
    order by random()
    limit p_limit
  )
  update public.stories s
  set scrape_dispatched_at = now()
  from picked p
  where s.story_id = p.story_id
  returning s.story_id, s.url;
end;
$$;

comment on function public.claim_stories_for_scrape(int, boolean) is 'Atomically claims stories ready for scrape (domain backlog + throttle). p_dry_run=true selects without claiming.';

create or replace function public.get_stories_ready_for_scrape(p_limit int default 1)
returns table (story_id uuid, url text)
language sql
volatile
security definer
set search_path = public
as $$
  select * from public.claim_stories_for_scrape(p_limit, false);
$$;

-- Atomically claim PENDING stories with cleaned bodies for review.
create or replace function public.claim_pending_stories_for_review(
  p_since timestamptz,
  p_limit int default 10
)
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
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.release_stale_review_claims();

  return query
  with to_claim as (
    select s.story_id
    from public.stories s
    join public.story_bodies sb on sb.story_id = s.story_id
    where s.relevance_status = 'PENDING'
      and s.review_claimed_at is null
      and s.created_at >= p_since
      and sb.content_clean is not null
    order by s.created_at
    limit p_limit
    for update skip locked
  )
  update public.stories s
  set review_claimed_at = now()
  from to_claim tc
  where s.story_id = tc.story_id
  returning
    s.story_id,
    s.title,
    s.content_snippet,
    s.content_full,
    s.url,
    s.created_at,
    (select src.name from public.sources src where src.source_id = s.source_id),
    (select sb.content_clean from public.story_bodies sb where sb.story_id = s.story_id);
end;
$$;

comment on function public.claim_pending_stories_for_review(timestamptz, int) is 'Atomically claims PENDING stories with content_clean for review_pending_stories.';

-- Read-only (dry_run / inspection); production uses claim_pending_stories_for_review.
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
    and s.review_claimed_at is null
    and s.created_at >= p_since
    and sb.content_clean is not null
  order by s.created_at asc
  limit p_limit;
$$;

-- Worker/dispatcher explicit failure (rare); clears dispatch lease.
create or replace function public.increment_scrape_fail_and_maybe_skip(p_story_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.stories
  set
    scrape_dispatched_at = null,
    scrape_fail_count = scrape_fail_count + 1,
    scrape_skipped = (scrape_fail_count + 1 >= 3),
    scrape_skipped_at = case
      when (scrape_fail_count + 1 >= 3) then coalesce(scrape_skipped_at, now())
      else scrape_skipped_at
    end,
    relevance_score = case
      when (scrape_fail_count + 1 >= 3)
        and (relevance_score is null or (coalesce(relevance_confidence, 0) < 60 and coalesce(relevance_score, 0) >= 50))
      then 0
      else relevance_score
    end,
    relevance_confidence = case
      when (scrape_fail_count + 1 >= 3)
        and (relevance_score is null or (coalesce(relevance_confidence, 0) < 60 and coalesce(relevance_score, 0) >= 50))
      then 100
      else relevance_confidence
    end
  where story_id = p_story_id;
$$;

comment on function public.increment_scrape_fail_and_maybe_skip(uuid) is 'Explicit scrape failure: clears scrape_dispatched_at, increments fail count, may skip and DROP PENDING.';

-- Extraction-ready index: exclude in-flight scrape/relevance (not being_processed).
drop index if exists public.idx_stories_extraction_ready;

create index idx_stories_extraction_ready
  on public.stories (created_at)
  where relevance_status = 'KEEP'
    and extraction_completed_at is null
    and extraction_skipped_empty = false
    and scrape_dispatched_at is null
    and relevance_claimed_at is null;

-- Health report: in-flight = scrape dispatch or relevance/review claim.
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
  story_events_created bigint,
  claims_created bigint,
  events_created bigint,
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
    (select count(*)::bigint from story_events where created_at >= (select t from since)),
    (select count(*)::bigint from claims where created_at >= (select t from since)),
    (select count(*)::bigint from events where created_at >= (select t from since)),
    (select count(*)::bigint from stories s
     left join story_bodies sb on sb.story_id = s.story_id
     where s.relevance_status = 'KEEP' and s.scrape_skipped = false and sb.story_id is null),
    (select count(*)::bigint from story_bodies where cleaned_at is null),
    (select count(*)::bigint from stories s
     where s.merged_at is null
     and exists (select 1 from story_chunks sc where sc.story_id = s.story_id)
     and not exists (select 1 from story_chunks sc where sc.story_id = s.story_id and sc.extraction_json is null)
     and not exists (select 1 from story_claims sc where sc.story_id = s.story_id)),
    (select count(*)::bigint from stories where relevance_status is null),
    (select count(*)::bigint from stories where scrape_skipped = true and scrape_skipped_at >= (select t from since)),
    (select count(*)::bigint from stories
     where scrape_dispatched_at is not null
        or relevance_claimed_at is not null
        or review_claimed_at is not null),
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

comment on column public.stories.being_processed is 'Deprecated: use scrape_dispatched_at, relevance_claimed_at, review_claimed_at. Column retained for backward compatibility.';
