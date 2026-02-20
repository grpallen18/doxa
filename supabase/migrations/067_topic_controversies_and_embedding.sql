-- Topic-controversy linking: topic_controversies table, question_embedding on controversy_clusters,
-- match_controversies_nearest RPC. Enables process_topic to link topics to debates.

set search_path = public, extensions;

-- 1. Add question_embedding to controversy_clusters (embed the debate question for similarity search)
alter table public.controversy_clusters
  add column if not exists question_embedding vector(1536);

comment on column public.controversy_clusters.question_embedding is 'Embedding of the debate question; used for topic similarity match. Populated by build_controversy_clusters.';

create index if not exists idx_controversy_clusters_question_embedding_hnsw
  on public.controversy_clusters using hnsw (question_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where question_embedding is not null;

-- 2. topic_controversies: many-to-many link between topics and controversy_clusters
create table if not exists public.topic_controversies (
  topic_id uuid not null references public.topics(topic_id) on delete cascade,
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  similarity_score numeric not null,
  rank int not null default 0,
  linked_at timestamptz not null default now(),
  primary key (topic_id, controversy_cluster_id)
);

create index if not exists idx_topic_controversies_topic_id on public.topic_controversies(topic_id);
create index if not exists idx_topic_controversies_controversy_id on public.topic_controversies(controversy_cluster_id);

alter table public.topic_controversies enable row level security;
create policy "Public read topic_controversies" on public.topic_controversies for select using (true);

-- 3. match_controversies_nearest: find controversies whose question_embedding is similar to query
create or replace function public.match_controversies_nearest(
  query_embedding text,
  match_count int default 50,
  min_similarity float default 0.50
)
returns table (controversy_cluster_id uuid, distance float, similarity float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select
    c.controversy_cluster_id,
    (c.question_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (c.question_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.controversy_clusters c
  where c.question_embedding is not null
    and c.status = 'active'
    and (1.0 - (c.question_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by c.question_embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_controversies_nearest(text, int, float) is 'Find controversies whose question_embedding is similar to query; returns controversy_cluster_id, distance, similarity. Used by process_topic.';

-- 4. Update upsert_controversy_clusters_batch to accept and store question_embedding
create or replace function public.upsert_controversy_clusters_batch(p_controversies jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c jsonb;
  fp text;
  pos_a uuid;
  pos_b uuid;
  q text;
  label_a text;
  label_b text;
  q_emb text;
  cid uuid;
  kept_count int := 0;
  marked_inactive_count int := 0;
  new_fps text[] := '{}';
  orphan_rec record;
begin
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

      insert into public.controversy_cluster_positions (
        controversy_cluster_id, position_cluster_id, side, stance_label
      ) values
        (cid, pos_a, 'A', label_a),
        (cid, pos_b, 'B', label_b);
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
