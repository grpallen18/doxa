-- Fix 5-minute bucket calculation. The previous formula using extract(minute) could
-- have timezone/edge-case issues. date_bin (PG14+) is more reliable.
create or replace function public.get_scrape_counts_by_five_min(p_hours int default 1)
returns table (bucket timestamptz, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_bin('5 min', sl.created_at, '2000-01-01'::timestamptz) as bucket,
    count(*) filter (where sl.outcome = 'success')::bigint as success_count,
    count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
  from scrape_log sl
  where sl.created_at >= (select now() - (p_hours || ' hours')::interval)
  group by date_bin('5 min', sl.created_at, '2000-01-01'::timestamptz)
  order by bucket;
$$;
