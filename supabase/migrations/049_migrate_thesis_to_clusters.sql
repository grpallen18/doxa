-- Migrate existing theses to claim_clusters. One-time seed.
-- Skips theses with fewer than 2 claims that have embeddings.
-- Uses thesis_text as cluster_label when available.

create extension if not exists pgcrypto;

do $$
declare
  r record;
  claim_ids uuid[];
  embedded_ids uuid[];
  centroid_vec vector(1536);
  fp text;
  total_sup bigint;
  distinct_src bigint;
  dom_ratio numeric;
  controversy numeric;
  ent numeric;
  n int;
  top_sup bigint;
begin
  for r in
    select t.thesis_id, t.thesis_text, t.label, t.centroid_embedding
    from public.theses t
    where exists (
      select 1 from public.thesis_claims tc
      join public.claims c on c.claim_id = tc.claim_id and c.embedding is not null
      where tc.thesis_id = t.thesis_id
    )
  loop
    -- Get claim_ids with embeddings
    select array_agg(tc.claim_id order by tc.claim_id)
    into claim_ids
    from public.thesis_claims tc
    join public.claims c on c.claim_id = tc.claim_id and c.embedding is not null
    where tc.thesis_id = r.thesis_id;

    if claim_ids is null or array_length(claim_ids, 1) < 2 then
      continue;
    end if;

    embedded_ids := claim_ids;
    n := array_length(embedded_ids, 1);

    -- Fingerprint: hash of sorted claim_ids
    fp := encode(sha256(array_to_string(embedded_ids, '|')::bytea), 'hex');

    -- Centroid: use thesis.centroid_embedding if available, else use first claim's embedding as proxy
    if r.centroid_embedding is not null then
      centroid_vec := r.centroid_embedding;
    else
      select c.embedding into centroid_vec
      from public.claims c
      where c.claim_id = embedded_ids[1] and c.embedding is not null
      limit 1;
      if centroid_vec is not null then
        centroid_vec := l2_normalize(centroid_vec);
      end if;
    end if;

    -- Support counts
    select
      coalesce(sum(cnt), 0),
      coalesce(max(cnt), 0)
    into total_sup, top_sup
    from (
      select count(distinct sc.story_id)::bigint as cnt
      from unnest(embedded_ids) as cid
      left join public.story_claims sc on sc.claim_id = cid
      group by cid
    ) x;
    dom_ratio := case when total_sup > 0 then top_sup::numeric / total_sup else 0 end;

    select count(distinct s.source_id) into distinct_src
    from public.story_claims sc
    join public.stories s on s.story_id = sc.story_id
    where sc.claim_id = any(embedded_ids);

    distinct_src := coalesce(distinct_src, 0);

    -- Entropy (simplified: use uniform if we don't have per-claim counts)
    ent := case when n > 1 then 1.0 else 0 end;

    controversy := 0.5 * least(1, ent) + 0.3 * least(1, distinct_src::numeric / 10) - 0.2 * dom_ratio;

    -- Cluster label: thesis_text or label
    insert into public.claim_clusters (
      cluster_fingerprint,
      centroid_embedding,
      controversy_score,
      total_support_count,
      distinct_source_count,
      dominant_claim_ratio,
      claim_count,
      cluster_label,
      cluster_label_computed_at,
      last_computed_at,
      seeded_from_thesis
    ) values (
      fp,
      centroid_vec,
      controversy,
      total_sup::int,
      distinct_src::int,
      dom_ratio,
      n,
      coalesce(nullif(trim(r.thesis_text), ''), r.label, 'Migrated thesis'),
      now(),
      now(),
      true
    )
    on conflict (cluster_fingerprint) do nothing;

    -- Insert members
    insert into public.claim_cluster_members (
      cluster_id,
      claim_id,
      support_count,
      distinct_source_count,
      rank
    )
    select
      cc.cluster_id,
      t.cid,
      coalesce((
        select count(distinct sc.story_id)::int
        from public.story_claims sc
        where sc.claim_id = t.cid
      ), 0),
      coalesce((
        select count(distinct s.source_id)::int
        from public.story_claims sc
        join public.stories s on s.story_id = sc.story_id
        where sc.claim_id = t.cid
      ), 0),
      row_number() over (order by
        (select count(distinct s.source_id) from public.story_claims sc join public.stories s on s.story_id = sc.story_id where sc.claim_id = t.cid) desc nulls last,
        (select count(*) from public.story_claims sc where sc.claim_id = t.cid) desc nulls last
      )::int
    from public.claim_clusters cc
    cross join unnest(embedded_ids) as t(cid)
    where cc.cluster_fingerprint = fp
    on conflict (cluster_id, claim_id) do update set
      support_count = excluded.support_count,
      distinct_source_count = excluded.distinct_source_count,
      rank = excluded.rank;

  end loop;
end $$;
