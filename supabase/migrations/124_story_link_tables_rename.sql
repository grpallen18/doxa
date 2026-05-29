-- Rename story link tables to consistent story_<a>_<b>_links pattern.
-- Drop story_event_positions (position→event context is derived via claims/evidence).
-- Add story_position_event_context view for downstream derived lookups.

set search_path = public, extensions;

drop table if exists public.story_event_positions cascade;

alter table if exists public.story_position_claims rename to story_position_claim_links;
alter table if exists public.story_position_evidence rename to story_position_evidence_links;
alter table if exists public.story_event_claims rename to story_event_claim_links;
alter table if exists public.story_event_evidence rename to story_event_evidence_links;

comment on table public.story_position_claim_links is 'Links story positions to supporting claims.';
comment on table public.story_position_evidence_links is 'Links story positions to supporting evidence.';
comment on table public.story_event_claim_links is 'Claims asserting facts about a story event.';
comment on table public.story_event_evidence_links is 'Evidence grounding that an event was described in the article.';

create or replace view public.story_position_event_context
with (security_invoker = true) as
select distinct
  sp.story_position_id,
  sp.canonical_position_id,
  se.story_event_id,
  se.event_id,
  'via_claim'::text as link_path
from public.story_position_claim_links spcl
join public.story_event_claim_links secl using (story_claim_id)
join public.story_positions sp using (story_position_id)
join public.story_events se using (story_event_id)

union

select distinct
  sp.story_position_id,
  sp.canonical_position_id,
  se.story_event_id,
  se.event_id,
  'via_evidence'::text as link_path
from public.story_position_evidence_links spel
join public.story_event_evidence_links seel using (evidence_id)
join public.story_positions sp using (story_position_id)
join public.story_events se using (story_event_id);

comment on view public.story_position_event_context is
  'Derived position→event paths via claims or evidence; not a primary extracted edge.';

create or replace function public.upsert_agreement_clusters_batch(p_clusters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c jsonb;
  fp text;
  pos_ids uuid[];
  aid uuid;
  kept_count int := 0;
  marked_inactive_count int := 0;
  new_fps text[] := '{}';
  orphan_rec record;
begin
  for c in select * from jsonb_array_elements(p_clusters)
  loop
    fp := c->>'fingerprint';
    if fp is null or fp = '' then continue; end if;
    select array_agg(x::uuid order by x::text) into pos_ids
    from jsonb_array_elements_text(c->'canonical_position_ids') as x;
    if pos_ids is null or array_length(pos_ids, 1) < 2 then continue; end if;

    insert into public.agreement_clusters (topic_id, membership_fingerprint, status, deactivated_at)
    values ((c->>'topic_id')::uuid, fp, 'active', null)
    on conflict (membership_fingerprint) where (membership_fingerprint is not null)
    do update set topic_id = excluded.topic_id, status = 'active', deactivated_at = null
    returning agreement_cluster_id into aid;

    if aid is null then
      select agreement_cluster_id into aid from public.agreement_clusters where membership_fingerprint = fp;
    end if;

    if aid is not null then
      kept_count := kept_count + 1;
      new_fps := array_append(new_fps, fp);

      delete from public.agreement_cluster_positions where agreement_cluster_id = aid;
      insert into public.agreement_cluster_positions (agreement_cluster_id, canonical_position_id)
      select aid, unnest(pos_ids);

      delete from public.agreement_cluster_claims where agreement_cluster_id = aid;
      insert into public.agreement_cluster_claims (agreement_cluster_id, claim_id)
      select distinct aid, sc.claim_id
      from public.story_positions sp
      join public.story_position_claim_links spcl on spcl.story_position_id = sp.story_position_id
      join public.story_claims sc on sc.story_claim_id = spcl.story_claim_id
      where sp.canonical_position_id = any(pos_ids) and sc.claim_id is not null;
    end if;
  end loop;

  for orphan_rec in
    select agreement_cluster_id from public.agreement_clusters
    where status = 'active' and membership_fingerprint is not null
      and membership_fingerprint != all(new_fps)
  loop
    update public.agreement_clusters set status = 'inactive', deactivated_at = now()
    where agreement_cluster_id = orphan_rec.agreement_cluster_id;
    marked_inactive_count := marked_inactive_count + 1;
  end loop;

  return jsonb_build_object('kept_count', kept_count, 'marked_inactive_count', marked_inactive_count);
end;
$$;

comment on column public.story_chunks.extraction_json is
  'Chunk-level extraction: claims, evidence, claim_evidence_links, positions, position_claim_links, position_evidence_links, events, event_claim_links, event_evidence_links. Populated by extract_story_entities.';
