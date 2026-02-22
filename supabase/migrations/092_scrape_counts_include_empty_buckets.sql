-- Return ALL hour buckets in the range, including empty ones. Previously we only returned
-- buckets that had data, so "Last 24 hours" would end at the last hour with scrapes (e.g. noon)
-- instead of extending to the current hour. Now the chart always shows the full time window.

create or replace function public.get_scrape_counts_by_hour(p_hours int default 24)
returns table (bucket timestamptz, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('hour', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC') - (p_hours || ' hours')::interval as start_hour,
      (date_trunc('hour', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC') as end_hour
  ),
  hour_buckets as (
    select ((date_trunc('hour', (b.start_hour AT TIME ZONE 'UTC')) + (n || ' hours')::interval) AT TIME ZONE 'UTC') as bucket
    from bounds b,
         generate_series(0, p_hours - 1) as n
  ),
  counts as (
    select
      (date_trunc('hour', (sl.created_at AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC') as bucket,
      count(*) filter (where sl.outcome = 'success')::bigint as success_count,
      count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
    from scrape_log sl
    where sl.created_at >= (select now() - (p_hours || ' hours')::interval)
    group by date_trunc('hour', (sl.created_at AT TIME ZONE 'UTC'))
  )
  select
    h.bucket,
    coalesce(c.success_count, 0)::bigint as success_count,
    coalesce(c.failure_count, 0)::bigint as failure_count
  from hour_buckets h
  left join counts c on h.bucket = c.bucket
  order by h.bucket;
$$;

comment on function public.get_scrape_counts_by_hour(int) is 'Returns scrape success/failure counts by hour (UTC) for the last p_hours. Includes empty buckets so chart shows full time window.';
