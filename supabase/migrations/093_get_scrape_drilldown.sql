-- RPC: Drill-down into scrape_log for a specific time bucket. Returns individual scrapes
-- (by domain, story, error) for cross-highlighting from the admin health chart.
create or replace function public.get_scrape_drilldown(
  p_bucket timestamptz,
  p_granularity text default 'hour',
  p_outcome text default 'failure'
)
returns table (
  domain text,
  story_id uuid,
  title text,
  url text,
  error text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with bucket_end as (
    select
      p_bucket as start_ts,
      case
        when p_granularity = '5min' then p_bucket + interval '5 min'
        else p_bucket + interval '1 hour'
      end as end_ts
  )
  select
    coalesce(sl.domain, 'unknown') as domain,
    sl.story_id,
    s.title,
    coalesce(sl.url, s.url) as url,
    sl.error,
    sl.created_at
  from scrape_log sl
  join stories s on s.story_id = sl.story_id
  cross join bucket_end b
  where sl.created_at >= b.start_ts
    and sl.created_at < b.end_ts
    and sl.outcome = p_outcome
  order by sl.domain, sl.created_at;
$$;

comment on function public.get_scrape_drilldown(timestamptz, text, text) is 'Returns scrape log rows for a time bucket. Used by admin health drill-down.';
