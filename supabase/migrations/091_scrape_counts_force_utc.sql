-- Force UTC for all scrape count functions. Supabase/Postgres session timezone can vary,
-- causing date_trunc to produce wrong buckets (e.g. chart cutting off 2-3 hours early in CST).
-- We explicitly use UTC so buckets and time ranges are consistent.

create or replace function public.get_scrape_counts_by_hour(p_hours int default 24)
returns table (bucket timestamptz, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (date_trunc('hour', (sl.created_at AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC') as bucket,
    count(*) filter (where sl.outcome = 'success')::bigint as success_count,
    count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
  from scrape_log sl
  where sl.created_at >= (select now() - (p_hours || ' hours')::interval)
  group by date_trunc('hour', (sl.created_at AT TIME ZONE 'UTC'))
  order by bucket;
$$;

comment on function public.get_scrape_counts_by_hour(int) is 'Returns scrape success/failure counts by hour (UTC) for the last p_hours.';

create or replace function public.get_scrape_counts_by_five_min(p_hours int default 1)
returns table (bucket timestamptz, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_bin('5 min', sl.created_at, ('2000-01-01'::timestamp AT TIME ZONE 'UTC')::timestamptz) as bucket,
    count(*) filter (where sl.outcome = 'success')::bigint as success_count,
    count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
  from scrape_log sl
  where sl.created_at >= (select now() - (p_hours || ' hours')::interval)
  group by date_bin('5 min', sl.created_at, ('2000-01-01'::timestamp AT TIME ZONE 'UTC')::timestamptz)
  order by bucket;
$$;

comment on function public.get_scrape_counts_by_five_min(int) is 'Returns scrape success/failure counts by 5-min buckets (UTC) for the last hour.';
