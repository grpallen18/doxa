-- RPC for update_stances: story_claims with null stance that have story content to evaluate.
-- Returns one claim at a time with article content for LLM stance assignment.

create or replace function public.get_story_claims_needing_stance(p_limit int default 1)
returns table (
  story_claim_id uuid,
  story_id uuid,
  raw_text text,
  content_clean text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sc.story_claim_id,
    sc.story_id,
    sc.raw_text,
    sb.content_clean
  from public.story_claims sc
  join public.story_bodies sb on sb.story_id = sc.story_id
  where sc.stance is null
    and sb.content_clean is not null
  order by sc.created_at asc
  limit p_limit;
$$;

comment on function public.get_story_claims_needing_stance(int) is 'Returns story_claims with null stance that have story content, for update_stances backfill. Ordered by created_at asc.';
