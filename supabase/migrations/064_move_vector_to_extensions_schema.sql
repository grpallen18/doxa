-- Move pgvector extension from public to extensions schema (security advisor 0014).
-- Update all vector-using functions to include extensions in search_path.

-- Step 1: Ensure extensions schema exists
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Step 2: Move the vector extension
alter extension vector set schema extensions;

-- Step 3: Set search_path so subsequent CREATE OR REPLACE resolves vector type
set search_path = public, extensions;

-- Step 4: Update functions to include extensions in search_path
create or replace function public.vector_div_scalar(v vector, s double precision)
returns vector
language sql immutable strict
set search_path = public, extensions
as $$
  select (array_agg(t.x / s order by t.ord))::vector
  from unnest(v::real[]) with ordinality as t(x, ord);
$$;

create or replace function public.match_claims_nearest(
  query_embedding text,
  match_count int default 1
)
returns table (claim_id uuid, distance float)
language sql stable
set search_path = public, extensions
as $$
  select c.claim_id, (c.embedding <=> query_embedding::vector)::float as distance
  from public.claims c
  where c.embedding is not null
  order by c.embedding <=> query_embedding::vector
  limit match_count;
$$;

-- match_clusters_nearest: only update if claim_clusters exists (created in 047)
do $mig$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'claim_clusters'
  ) then
    execute $exec$
      create or replace function public.match_clusters_nearest(
        query_embedding text,
        match_count int default 50,
        min_similarity float default 0.60
      )
      returns table (cluster_id uuid, distance float, similarity float)
      language sql stable
      security definer
      set search_path = public, extensions
      as $fn$
        select
          c.cluster_id,
          (c.centroid_embedding <=> query_embedding::vector)::float as distance,
          (1.0 - (c.centroid_embedding <=> query_embedding::vector)::float)::float as similarity
        from public.claim_clusters c
        where c.centroid_embedding is not null
          and (1.0 - (c.centroid_embedding <=> query_embedding::vector)::float) >= min_similarity
        order by c.centroid_embedding <=> query_embedding::vector
        limit match_count;
      $fn$
    $exec$;
  end if;
end $mig$;

create or replace function public.match_theses_nearest(
  query_embedding text,
  match_count int default 50,
  min_similarity float default 0.60
)
returns table (thesis_id uuid, distance float, similarity float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select
    t.thesis_id,
    (t.centroid_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (t.centroid_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.theses t
  where t.centroid_embedding is not null
    and (1.0 - (t.centroid_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by t.centroid_embedding <=> query_embedding::vector
  limit match_count;
$$;

create or replace function public.match_topics_nearest(
  query_embedding text,
  exclude_topic_id uuid default null,
  match_count int default 10,
  min_similarity float default 0.70
)
returns table (topic_id uuid, distance float, similarity float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select
    t.topic_id,
    (t.topic_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (t.topic_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.topics t
  where t.topic_embedding is not null
    and (exclude_topic_id is null or t.topic_id != exclude_topic_id)
    and (1.0 - (t.topic_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by t.topic_embedding <=> query_embedding::vector
  limit match_count;
$$;

create or replace function public.claim_to_thesis_run(p_max_claims int default 5, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  v_link_exists boolean;
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

      if p_dry_run then
        select exists (
          select 1 from public.thesis_claims
          where thesis_id = v_match.thesis_id and claim_id = v_claim.claim_id
        ) into v_link_exists;
        v_ins_count := case when v_link_exists then 0 else 1 end;
      else
        insert into public.thesis_claims (thesis_id, claim_id)
        values (v_match.thesis_id, v_claim.claim_id)
        on conflict (thesis_id, claim_id) do nothing;
        get diagnostics v_ins_count = row_count;
      end if;

      if v_ins_count > 0 then
        v_linked := v_linked + 1;
        v_linked_this_claim := true;

        if not p_dry_run then
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
      end if;
    end loop;

    if not v_linked_this_claim then
      v_created_theses := v_created_theses + 1;
      v_linked := v_linked + 1;
      if not p_dry_run then
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
        insert into public.thesis_claims (thesis_id, claim_id)
        values (v_new_thesis_id, v_claim.claim_id);
      end if;
    end if;

    if not p_dry_run then
      update public.claims
      set thesis_clustered_at = now()
      where claim_id = v_claim.claim_id;
    end if;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'linked', v_linked,
    'created_theses', v_created_theses,
    'dry_run', p_dry_run
  );
end;
$$;
