-- Fix ambiguous column reference "c" in upsert_position_clusters_batch.
-- The PL/pgSQL variable c (from the first loop) conflicted with the alias c in the orphan block's SELECT.
-- Rename the alias to elem to avoid the conflict.

create or replace function public.upsert_position_clusters_batch(p_clusters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  fp text;
  claim_ids uuid[];
  pid uuid;
  kept_count int := 0;
  marked_inactive_count int := 0;
  new_fps text[] := '{}';
  orphan_rec record;
  orphan_claims uuid[];
  overlapping_fps text[];
  rel text;
  target_pid uuid;
begin
  -- 1. Upsert each cluster and sync position_cluster_claims
  for c in select * from jsonb_array_elements(p_clusters)
  loop
    fp := c->>'fingerprint';
    if fp is null or fp = '' then
      continue;
    end if;
    select array_agg(x::uuid order by x::text)
    into claim_ids
    from jsonb_array_elements_text(c->'claim_ids') as x;
    if claim_ids is null or array_length(claim_ids, 1) < 2 then
      continue;
    end if;

    -- Upsert position_clusters
    insert into public.position_clusters (membership_fingerprint, status, deactivated_at)
    values (fp, 'active', null)
    on conflict (membership_fingerprint) where (membership_fingerprint is not null)
    do update set
      status = 'active',
      deactivated_at = null
    returning position_cluster_id into pid;

    if pid is null then
      select position_cluster_id into pid
      from public.position_clusters
      where membership_fingerprint = fp;
    end if;

    if pid is not null then
      kept_count := kept_count + 1;
      new_fps := array_append(new_fps, fp);

      -- Sync position_cluster_claims: delete existing, insert new
      delete from public.position_cluster_claims
      where position_cluster_id = pid;

      insert into public.position_cluster_claims (position_cluster_id, claim_id, role)
      select
        pid,
        elem as claim_id,
        case when idx <= least(5, array_length(claim_ids, 1)) then 'core' else 'supporting' end
      from unnest(claim_ids) with ordinality as t(elem, idx);
    end if;
  end loop;

  -- 2. For each orphan: detect merge/split, insert lineage, mark inactive
  for orphan_rec in
    select pc.position_cluster_id, pc.membership_fingerprint,
           (select array_agg(claim_id) from public.position_cluster_claims where position_cluster_id = pc.position_cluster_id) as claim_ids
    from public.position_clusters pc
    where pc.status = 'active'
      and pc.membership_fingerprint is not null
      and pc.membership_fingerprint != all(new_fps)
  loop
    orphan_claims := orphan_rec.claim_ids;
    if orphan_claims is null then
      update public.position_clusters
      set status = 'inactive', deactivated_at = now()
      where position_cluster_id = orphan_rec.position_cluster_id;
      marked_inactive_count := marked_inactive_count + 1;
      continue;
    end if;

    -- Find new clusters that contain any of orphan's claims (alias elem to avoid conflict with variable c)
    select array_agg(distinct elem->>'fingerprint')
    into overlapping_fps
    from jsonb_array_elements(p_clusters) as elem,
         jsonb_array_elements_text(elem->'claim_ids') as cid,
         unnest(orphan_claims) as oc
    where cid::uuid = oc
      and (elem->>'fingerprint') is not null;

    if overlapping_fps is not null and array_length(overlapping_fps, 1) >= 1 then
      if array_length(overlapping_fps, 1) = 1 then
        rel := 'merged_into';
      else
        rel := 'split_into';
      end if;
      for target_pid in
        select position_cluster_id
        from public.position_clusters
        where membership_fingerprint = any(overlapping_fps)
      loop
        insert into public.position_cluster_migrations (old_position_cluster_id, new_position_cluster_id, relationship)
        values (orphan_rec.position_cluster_id, target_pid, rel);
      end loop;
    end if;

    update public.position_clusters
    set status = 'inactive', deactivated_at = now()
    where position_cluster_id = orphan_rec.position_cluster_id;
    marked_inactive_count := marked_inactive_count + 1;
  end loop;

  return jsonb_build_object('kept_count', kept_count, 'marked_inactive_count', marked_inactive_count);
end;
$$;

comment on function public.upsert_position_clusters_batch(jsonb) is 'Upserts position clusters by fingerprint, syncs claims, records merge/split lineage, marks orphans inactive. Used by build_position_clusters.';
