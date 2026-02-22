-- RPC: Scrape stats by source (domain) for the last 24 hours.
-- Used by discord_daily_health to show per-source breakdown in the Scraping embed.
create or replace function public.get_scrape_stats_by_source()
returns table (
  domain text,
  total bigint,
  successes bigint,
  failures bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - interval '24 hours' as t)
  select
    coalesce(sl.domain, 'unknown') as domain,
    count(*)::bigint as total,
    count(*) filter (where sl.outcome = 'success')::bigint as successes,
    count(*) filter (where sl.outcome = 'failure')::bigint as failures
  from scrape_log sl
  where sl.created_at >= (select t from since)
  group by coalesce(sl.domain, 'unknown')
  order by count(*) desc;
$$;

comment on function public.get_scrape_stats_by_source() is 'Returns scrape counts by domain for the last 24h. Used by discord_daily_health for per-source breakdown.';
