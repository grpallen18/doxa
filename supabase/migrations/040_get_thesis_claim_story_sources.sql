-- RPC for label_thesis: returns thesis->claim->story->source mapping for given thesis IDs.
-- Avoids PostgREST row limits when computing distinct_stories and distinct_sources per thesis.

create or replace function public.get_thesis_claim_story_sources(p_thesis_ids uuid[])
returns table (
  thesis_id uuid,
  claim_id uuid,
  story_id uuid,
  source_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tc.thesis_id,
    tc.claim_id,
    sc.story_id,
    s.source_id
  from public.thesis_claims tc
  join public.story_claims sc on sc.claim_id = tc.claim_id
  join public.stories s on s.story_id = sc.story_id
  where tc.thesis_id = any(p_thesis_ids);
$$;

comment on function public.get_thesis_claim_story_sources(uuid[]) is 'Returns thesis-claim-story-source rows for label_thesis diversity filter. No row limit.';
