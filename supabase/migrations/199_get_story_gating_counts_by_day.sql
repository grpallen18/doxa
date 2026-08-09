-- Per-day story gating counts (KEEP / DROP / PENDING) for admin Story Gating chart.
-- Null relevance_status is grouped with PENDING (not yet classified).

create or replace function public.get_story_gating_counts_by_day(p_since timestamptz)
returns table (
  day date,
  keep_count bigint,
  drop_count bigint,
  pending_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (created_at at time zone 'utc')::date as day,
    count(*) filter (
      where coalesce(relevance_status, 'PENDING') = 'KEEP'
    )::bigint as keep_count,
    count(*) filter (
      where coalesce(relevance_status, 'PENDING') = 'DROP'
    )::bigint as drop_count,
    count(*) filter (
      where coalesce(relevance_status, 'PENDING') not in ('KEEP', 'DROP')
    )::bigint as pending_count
  from public.stories
  where created_at >= p_since
  group by 1
  order by 1;
$$;

comment on function public.get_story_gating_counts_by_day(timestamptz) is
  'Returns per-UTC-day KEEP/DROP/PENDING story counts since p_since (null status → PENDING) for admin Story Gating chart.';

grant execute on function public.get_story_gating_counts_by_day(timestamptz) to service_role;
