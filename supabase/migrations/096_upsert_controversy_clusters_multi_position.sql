-- Extend upsert_controversy_clusters_batch to accept positions array for multi-sided controversies.
-- New format: { fingerprint, question, question_embedding, positions: [{ position_cluster_id, stance_label }, ...] }

create or replace function public.upsert_controversy_clusters_batch(p_controversies jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c jsonb;
  fp text;
  q text;
  q_emb text;
  cid uuid;
  kept_count int := 0;
  marked_inactive_count int := 0;
  new_fps text[] := '{}';
  orphan_rec record;
  pos_arr jsonb;
  pos_elem jsonb;
  pos_id uuid;
  stance_lbl text;
  idx int;
  side_char text;
begin
  for c in select * from jsonb_array_elements(p_controversies)
  loop
    fp := c->>'fingerprint';
    if fp is null or fp = '' then
      continue;
    end if;
    pos_arr := c->'positions';
    if pos_arr is null or jsonb_array_length(pos_arr) < 2 then
      continue;
    end if;
    q := coalesce(nullif(trim(c->>'question'), ''), 'What is the debate?');
    q_emb := nullif(trim(c->>'question_embedding'), '');

    insert into public.controversy_clusters (controversy_fingerprint, question, label, question_embedding, status, deactivated_at)
    values (fp, q, q, case when q_emb is not null then q_emb::vector else null end, 'active', null)
    on conflict (controversy_fingerprint) where (controversy_fingerprint is not null)
    do update set
      question = excluded.question,
      label = excluded.label,
      question_embedding = coalesce(excluded.question_embedding, controversy_clusters.question_embedding),
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

      delete from public.controversy_cluster_positions
      where controversy_cluster_id = cid;

      idx := 0;
      for pos_elem in select * from jsonb_array_elements(pos_arr)
      loop
        pos_id := (pos_elem->>'position_cluster_id')::uuid;
        stance_lbl := coalesce(nullif(trim(pos_elem->>'stance_label'), ''), 'Position ' || chr(65 + least(idx, 25)));
        side_char := chr(65 + least(idx, 25));
        insert into public.controversy_cluster_positions (
          controversy_cluster_id, position_cluster_id, side, stance_label
        ) values (cid, pos_id, side_char, stance_lbl);
        idx := idx + 1;
      end loop;
    end if;
  end loop;

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

comment on function public.upsert_controversy_clusters_batch(jsonb) is 'Upserts controversy clusters by fingerprint. Accepts positions array for multi-sided controversies. Used by build_controversy_clusters.';
