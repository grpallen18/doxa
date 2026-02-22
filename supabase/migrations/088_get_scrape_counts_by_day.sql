-- RPC: Scrape counts by day for the last p_days. Used by admin health chart.
create or replace function public.get_scrape_counts_by_day(p_days int default 7)
returns table (day date, success_count bigint, failure_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date(sl.created_at) as day,
    count(*) filter (where sl.outcome = 'success')::bigint as success_count,
    count(*) filter (where sl.outcome = 'failure')::bigint as failure_count
  from scrape_log sl
  where sl.created_at >= (select now() - (p_days || ' days')::interval)
  group by date(sl.created_at)
  order by day;
$$;

comment on function public.get_scrape_counts_by_day(int) is 'Returns scrape success/failure counts by day for the last p_days. Used by admin health chart.';
