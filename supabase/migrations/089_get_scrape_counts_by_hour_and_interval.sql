-- RPC: Scrape counts by hour for the last p_hours. Used by admin health chart (24h view).
create or replace function public.get_scrape_counts_by_hour(p_hours int default 24)
returns table (bucket timestamptz, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('hour', sl.created_at) as bucket,
    count(*) filter (where sl.outcome = 'success')::bigint as success_count,
    count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
  from scrape_log sl
  where sl.created_at >= (select now() - (p_hours || ' hours')::interval)
  group by date_trunc('hour', sl.created_at)
  order by bucket;
$$;

comment on function public.get_scrape_counts_by_hour(int) is 'Returns scrape success/failure counts by hour for the last p_hours. Used by admin health chart.';

-- RPC: Scrape counts by 5-minute buckets for the last hour. Used by admin health chart (1h view).
create or replace function public.get_scrape_counts_by_five_min(p_hours int default 1)
returns table (bucket timestamptz, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('hour', sl.created_at) + floor(extract(minute from sl.created_at) / 5) * interval '5 min' as bucket,
    count(*) filter (where sl.outcome = 'success')::bigint as success_count,
    count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
  from scrape_log sl
  where sl.created_at >= (select now() - (p_hours || ' hours')::interval)
  group by date_trunc('hour', sl.created_at) + floor(extract(minute from sl.created_at) / 5) * interval '5 min'
  order by bucket;
$$;

comment on function public.get_scrape_counts_by_five_min(int) is 'Returns scrape success/failure counts by 5-minute buckets for the last hour. Used by admin health chart.';
