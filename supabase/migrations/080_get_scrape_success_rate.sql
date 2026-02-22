-- RPC: scrape success rate from scrape_log over a time window.
create or replace function public.get_scrape_success_rate(p_hours int default 24)
returns table (successes bigint, failures bigint, total bigint, success_rate_pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - (p_hours || ' hours')::interval as t),
  s as (select count(*)::bigint as cnt from scrape_log where outcome = 'success' and created_at >= (select t from since)),
  f as (select count(*)::bigint as cnt from scrape_log where outcome = 'failure' and created_at >= (select t from since))
  select s.cnt, f.cnt, s.cnt + f.cnt, round(100.0 * s.cnt / nullif(s.cnt + f.cnt, 0), 1)
  from s, f;
$$;

comment on function public.get_scrape_success_rate(int) is 'Returns scrape success/failure counts and success rate % from scrape_log for the last p_hours.';
