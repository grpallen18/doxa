-- claim_to_thesis_run: cluster claims into theses by embedding similarity (FOR UPDATE SKIP LOCKED).
-- Run via cron (e.g. SELECT claim_to_thesis_run(5); every 2 min).
-- Helper: pgvector has no vector/scalar divide; centroid update uses vector_add + scaled delta.

create or replace function public.vector_div_scalar(v vector, s double precision)
returns vector
language sql immutable strict
as $$
  select (array_agg(t.x / s order by t.ord))::vector
  from unnest(v::real[]) with ordinality as t(x, ord);
$$;

create or replace function public.claim_to_thesis_run(p_max_claims int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
  v_match record;
  v_ins_count int;
  v_processed int := 0;
  v_linked int := 0;
  v_created_theses int := 0;
  v_link_threshold float := 0.70;
  v_max_links int := 3;
  v_linked_this_claim boolean;
  v_old_centroid vector(1536);
  v_old_count int;
  v_new_centroid vector(1536);
  v_new_thesis_id uuid;
begin
  for v_claim in
    select c.claim_id, c.embedding
    from public.claims c
    where c.thesis_clustered_at is null
      and c.embedding is not null
    order by c.created_at
    limit p_max_claims
    for update of c skip locked
  loop
    v_processed := v_processed + 1;
    v_linked_this_claim := false;

    -- Top theses by cosine similarity (1 - distance) >= link_threshold, cap at max_links
    for v_match in
      select t.thesis_id, (v_claim.embedding <=> t.centroid_embedding)::float as dist
      from public.theses t
      where t.centroid_embedding is not null
      order by v_claim.embedding <=> t.centroid_embedding
      limit v_max_links
    loop
      if (1.0 - v_match.dist) < v_link_threshold then
        exit;
      end if;

      insert into public.thesis_claims (thesis_id, claim_id)
      values (v_match.thesis_id, v_claim.claim_id)
      on conflict (thesis_id, claim_id) do nothing;

      get diagnostics v_ins_count = row_count;
      if v_ins_count > 0 then
        v_linked := v_linked + 1;
        v_linked_this_claim := true;

        select t.centroid_embedding, t.claim_count
          into v_old_centroid, v_old_count
          from public.theses t
          where t.thesis_id = v_match.thesis_id;

        v_new_centroid := l2_normalize(
          vector_add(
            v_old_centroid,
            vector_div_scalar(
              v_claim.embedding - v_old_centroid,
              (v_old_count + 1)::double precision
            )
          )
        );
        update public.theses
        set centroid_embedding = v_new_centroid,
            claim_count = claim_count + 1,
            updated_at = now()
        where thesis_id = v_match.thesis_id;
      end if;
    end loop;

    if not v_linked_this_claim then
      -- No match: create new thesis bucket and link
      insert into public.theses (
        centroid_embedding,
        claim_count,
        thesis_text_ok,
        last_text_ok_claim_count
      )
      values (
        l2_normalize(v_claim.embedding),
        1,
        false,
        0
      )
      returning thesis_id into v_new_thesis_id;

      v_created_theses := v_created_theses + 1;
      insert into public.thesis_claims (thesis_id, claim_id)
      values (v_new_thesis_id, v_claim.claim_id);
    end if;

    update public.claims
    set thesis_clustered_at = now()
    where claim_id = v_claim.claim_id;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'linked', v_linked,
    'created_theses', v_created_theses
  );
end;
$$;

comment on function public.claim_to_thesis_run(int) is 'Cluster up to max_claims unclustered claims into theses by embedding similarity; creates new thesis if no match. Run via cron.';
