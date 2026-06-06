-- Admin: unlink canonical IDs for one story without wiping extraction/merge data.

set search_path = public, extensions;

create or replace function public.reset_story_canonical_links(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_ids uuid[];
  v_event_ids uuid[];
  v_position_ids uuid[];
  v_shared_claim_ids uuid[] := '{}';
  v_shared_event_ids uuid[] := '{}';
  v_shared_position_ids uuid[] := '{}';
  v_claims_unlinked int := 0;
  v_events_unlinked int := 0;
  v_positions_unlinked int := 0;
  v_stances_cleared int := 0;
  v_orphan_claims_deleted int := 0;
  v_orphan_events_deleted int := 0;
  v_orphan_positions_deleted int := 0;
begin
  if not exists (select 1 from public.stories s where s.story_id = p_story_id) then
    raise exception 'Story not found: %', p_story_id;
  end if;

  select coalesce(array_agg(distinct sc.claim_id), '{}')
  into v_claim_ids
  from public.story_claims sc
  where sc.story_id = p_story_id
    and sc.claim_id is not null;

  select coalesce(array_agg(distinct se.event_id), '{}')
  into v_event_ids
  from public.story_events se
  where se.story_id = p_story_id
    and se.event_id is not null;

  select coalesce(array_agg(distinct sp.canonical_position_id), '{}')
  into v_position_ids
  from public.story_positions sp
  where sp.story_id = p_story_id
    and sp.canonical_position_id is not null;

  if coalesce(array_length(v_claim_ids, 1), 0) > 0 then
    select coalesce(array_agg(distinct sc.claim_id), '{}')
    into v_shared_claim_ids
    from public.story_claims sc
    where sc.claim_id = any (v_claim_ids)
      and sc.story_id <> p_story_id;
  end if;

  if coalesce(array_length(v_event_ids, 1), 0) > 0 then
    select coalesce(array_agg(distinct se.event_id), '{}')
    into v_shared_event_ids
    from public.story_events se
    where se.event_id = any (v_event_ids)
      and se.story_id <> p_story_id;
  end if;

  if coalesce(array_length(v_position_ids, 1), 0) > 0 then
    select coalesce(array_agg(distinct sp.canonical_position_id), '{}')
    into v_shared_position_ids
    from public.story_positions sp
    where sp.canonical_position_id = any (v_position_ids)
      and sp.story_id <> p_story_id;
  end if;

  update public.story_claims
  set claim_id = null, stance = null
  where story_id = p_story_id
    and (claim_id is not null or stance is not null);
  get diagnostics v_claims_unlinked = row_count;
  v_stances_cleared := v_claims_unlinked;

  update public.story_events
  set event_id = null
  where story_id = p_story_id
    and event_id is not null;
  get diagnostics v_events_unlinked = row_count;

  update public.story_positions
  set canonical_position_id = null
  where story_id = p_story_id
    and canonical_position_id is not null;
  get diagnostics v_positions_unlinked = row_count;

  if coalesce(array_length(v_claim_ids, 1), 0) > 0 then
    delete from public.claims c
    where c.claim_id = any (v_claim_ids)
      and not exists (
        select 1 from public.story_claims sc where sc.claim_id = c.claim_id
      );
    get diagnostics v_orphan_claims_deleted = row_count;
  end if;

  if coalesce(array_length(v_event_ids, 1), 0) > 0 then
    delete from public.events e
    where e.event_id = any (v_event_ids)
      and not exists (
        select 1 from public.story_events se where se.event_id = e.event_id
      );
    get diagnostics v_orphan_events_deleted = row_count;
  end if;

  if coalesce(array_length(v_position_ids, 1), 0) > 0 then
    delete from public.canonical_positions cp
    where cp.canonical_position_id = any (v_position_ids)
      and not exists (
        select 1 from public.story_positions sp where sp.canonical_position_id = cp.canonical_position_id
      );
    get diagnostics v_orphan_positions_deleted = row_count;
  end if;

  return jsonb_build_object(
    'story_id', p_story_id,
    'claims_unlinked', v_claims_unlinked,
    'events_unlinked', v_events_unlinked,
    'positions_unlinked', v_positions_unlinked,
    'stances_cleared', v_stances_cleared,
    'orphan_claims_deleted', v_orphan_claims_deleted,
    'orphan_events_deleted', v_orphan_events_deleted,
    'orphan_positions_deleted', v_orphan_positions_deleted,
    'shared_claim_ids', to_jsonb(v_shared_claim_ids),
    'shared_event_ids', to_jsonb(v_shared_event_ids),
    'shared_position_ids', to_jsonb(v_shared_position_ids)
  );
end;
$$;

comment on function public.reset_story_canonical_links(uuid) is
  'Admin: unlink canonical IDs for one story. Preserves merged extraction and story entities; deletes orphan-only canonical rows.';

revoke all on function public.reset_story_canonical_links(uuid) from public;
grant execute on function public.reset_story_canonical_links(uuid) to service_role;
