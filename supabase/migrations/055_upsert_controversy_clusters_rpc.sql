-- RPC: upsert_controversy_clusters_batch
-- Receives controversies from build_controversy_clusters; upserts by fingerprint,
-- syncs controversy_cluster_positions, marks orphan controversies inactive. Single transaction.

create or replace function public.upsert_controversy_clusters_batch(p_controversies jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  fp text;
  pos_a uuid;
  pos_b uuid;
  q text;
  label_a text;
  label_b text;
  cid uuid;
  kept_count int := 0;
  marked_inactive_count int := 0;
  new_fps text[] := '{}';
  orphan_rec record;
begin
  -- 1. Upsert each controversy and sync controversy_cluster_positions
  for c in select * from jsonb_array_elements(p_controversies)
  loop
    fp := c->>'fingerprint';
    if fp is null or fp = '' then
      continue;
    end if;
    pos_a := (c->>'position_a_id')::uuid;
    pos_b := (c->>'position_b_id')::uuid;
    if pos_a is null or pos_b is null or pos_a >= pos_b then
      continue;
    end if;
    q := coalesce(nullif(trim(c->>'question'), ''), 'What is the debate?');
    label_a := coalesce(nullif(trim(c->>'label_a'), ''), 'Position A');
    label_b := coalesce(nullif(trim(c->>'label_b'), ''), 'Position B');

    -- Upsert controversy_clusters
    insert into public.controversy_clusters (controversy_fingerprint, question, label, status, deactivated_at)
    values (fp, q, q, 'active', null)
    on conflict (controversy_fingerprint) where (controversy_fingerprint is not null)
    do update set
      question = excluded.question,
      label = excluded.label,
      status = 'active',
      deactivated_at = null
    returning controversy_cluster_id into cid;

    if cid is null then
      select controversy_cluster_id into cid
      from public.controversy_clusters
      where controversy_fingerprint = fp;
    end if;

    if cid is not null then
      kept_count := kept_count + 1;
      new_fps := array_append(new_fps, fp);

      -- Sync controversy_cluster_positions: delete existing, insert new
      delete from public.controversy_cluster_positions
      where controversy_cluster_id = cid;

      insert into public.controversy_cluster_positions (
        controversy_cluster_id, position_cluster_id, side, stance_label
      ) values
        (cid, pos_a, 'A', label_a),
        (cid, pos_b, 'B', label_b);
    end if;
  end loop;

  -- 2. Mark orphan controversies inactive
  for orphan_rec in
    select controversy_cluster_id
    from public.controversy_clusters
    where status = 'active'
      and controversy_fingerprint is not null
      and controversy_fingerprint != all(new_fps)
  loop
    update public.controversy_clusters
    set status = 'inactive', deactivated_at = now()
    where controversy_cluster_id = orphan_rec.controversy_cluster_id;
    marked_inactive_count := marked_inactive_count + 1;
  end loop;

  return jsonb_build_object('kept_count', kept_count, 'marked_inactive_count', marked_inactive_count);
end;
$$;

comment on function public.upsert_controversy_clusters_batch(jsonb) is 'Upserts controversy clusters by fingerprint, syncs positions link, marks orphans inactive. Used by build_controversy_clusters.';
