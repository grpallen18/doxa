-- Daily story ingest counts for admin dashboard metrics (avoids PostgREST max_rows cap).

create or replace function public.get_story_ingest_counts_by_day(p_since timestamptz)
returns table (
  day date,
  count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (created_at at time zone 'utc')::date as day,
    count(*)::bigint as count
  from public.stories
  where created_at >= p_since
  group by 1
  order by 1;
$$;

comment on function public.get_story_ingest_counts_by_day(timestamptz) is
  'Returns per-UTC-day story insert counts since p_since for admin dashboard sparklines.';

grant execute on function public.get_story_ingest_counts_by_day(timestamptz) to service_role;
