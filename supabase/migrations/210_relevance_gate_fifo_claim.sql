-- Relevance-gate FIFO: claim oldest unclassified stories first.
-- p_since is optional; NULL means no created_at window (drain historical backlog).

drop function if exists public.mark_no_url_stories_unclassified(timestamptz);
drop function if exists public.claim_stories_for_relevance(timestamptz, int);

create or replace function public.mark_no_url_stories_unclassified(p_since timestamptz default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with updated as (
    update public.stories
    set
      relevance_score = 0,
      relevance_confidence = 100,
      relevance_reason = 'No URL; cannot scrape.',
      relevance_tags = array['no_url']::text[],
      relevance_model = coalesce(relevance_model, 'system'),
      relevance_ran_at = now(),
      relevance_claimed_at = null,
      scrape_skipped = true,
      scrape_skipped_at = coalesce(scrape_skipped_at, now())
    where relevance_status is null
      and relevance_claimed_at is null
      and (p_since is null or created_at >= p_since)
      and (url is null or trim(url) = '')
    returning 1
  )
  select count(*)::int into n from updated;
  return n;
end;
$$;

comment on function public.mark_no_url_stories_unclassified(timestamptz) is
  'DROP unclassified stories with no URL. p_since NULL = all ages (FIFO backlog).';

create or replace function public.claim_stories_for_relevance(
  p_since timestamptz default null,
  p_limit int default 10
)
returns table (
  story_id uuid,
  title text,
  content_snippet text,
  content_full text,
  url text,
  created_at timestamptz,
  source_name text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.release_stale_relevance_claims();

  return query
  with to_claim as (
    select s.story_id
    from public.stories s
    where s.relevance_status is null
      and s.relevance_claimed_at is null
      and (p_since is null or s.created_at >= p_since)
      and s.url is not null
      and trim(s.url) <> ''
    order by s.created_at asc, s.story_id asc
    limit p_limit
    for update skip locked
  )
  update public.stories s
  set relevance_claimed_at = now()
  from to_claim tc
  where s.story_id = tc.story_id
  returning
    s.story_id,
    s.title,
    s.content_snippet,
    s.content_full,
    s.url,
    s.created_at,
    (select src.name from public.sources src where src.source_id = s.source_id);
end;
$$;

comment on function public.claim_stories_for_relevance(timestamptz, int) is
  'Atomically claims unclassified stories with URLs for relevance_gate, oldest first (FIFO). p_since NULL = no lookback window.';

grant execute on function public.mark_no_url_stories_unclassified(timestamptz) to service_role;
grant execute on function public.claim_stories_for_relevance(timestamptz, int) to service_role;
