-- Drop old position/controversy schema; create agreement-based schema.
-- Order: drop dependents, drop tables, create new tables, recreate dependents, update RPCs.

set search_path = public, extensions;

-- 1. Drop topic_controversies (FK to controversy_clusters)
drop table if exists public.topic_controversies cascade;

-- 2. Drop controversy_viewpoints (FK to controversy_clusters and position_clusters)
drop table if exists public.controversy_viewpoints cascade;

-- 3. Drop remaining old tables
drop table if exists public.controversy_cluster_positions cascade;
drop table if exists public.controversy_clusters cascade;
drop table if exists public.position_pair_scores cascade;
drop table if exists public.position_cluster_claims cascade;
drop table if exists public.position_clusters cascade;
drop table if exists public.position_summary_cache cascade;
drop table if exists public.position_cluster_migrations cascade;

-- 4. Drop functions that referenced dropped tables
drop function if exists public.upsert_position_clusters_batch(jsonb);
drop function if exists public.upsert_position_pair_scores(jsonb);
drop function if exists public.upsert_controversy_clusters_batch(jsonb);
drop function if exists public.compute_position_centroids();
drop function if exists public.sync_position_summaries_from_cache(int);
drop function if exists public.match_controversies_nearest(text, int, float);
drop function if exists public.run_orphan_cleanup();
drop function if exists public.get_daily_health_report();

-- 5. Create controversy_clusters (debate container)
create table public.controversy_clusters (
  controversy_cluster_id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(topic_id) on delete set null,
  question text not null,
  proposition text,
  label text,
  summary text,
  question_embedding vector(1536),
  controversy_fingerprint text,
  status text not null default 'active',
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_controversy_clusters_topic on public.controversy_clusters(topic_id);
create index if not exists idx_controversy_clusters_question_embedding_hnsw
  on public.controversy_clusters using hnsw (question_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where question_embedding is not null;

create unique index if not exists idx_controversy_clusters_controversy_fingerprint
  on public.controversy_clusters (controversy_fingerprint)
  where controversy_fingerprint is not null;

-- 6. Create agreement_clusters (replaces position_clusters)
create table public.agreement_clusters (
  agreement_cluster_id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(topic_id) on delete set null,
  label text,
  summary text,
  centroid_embedding vector(1536),
  membership_fingerprint text,
  status text not null default 'active',
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_agreement_clusters_topic on public.agreement_clusters(topic_id);
create unique index if not exists idx_agreement_clusters_membership_fingerprint
  on public.agreement_clusters (membership_fingerprint)
  where membership_fingerprint is not null;

-- 7. Create agreement_cluster_positions
create table public.agreement_cluster_positions (
  agreement_cluster_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  canonical_position_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  primary key (agreement_cluster_id, canonical_position_id)
);

create index if not exists idx_agreement_cluster_positions_cluster on public.agreement_cluster_positions(agreement_cluster_id);
create index if not exists idx_agreement_cluster_positions_position on public.agreement_cluster_positions(canonical_position_id);

-- 8. Create agreement_cluster_claims
create table public.agreement_cluster_claims (
  agreement_cluster_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  claim_id uuid not null references public.claims(claim_id) on delete cascade,
  primary key (agreement_cluster_id, claim_id)
);

create index if not exists idx_agreement_cluster_claims_cluster on public.agreement_cluster_claims(agreement_cluster_id);

-- 9. Create controversy_cluster_agreements (replaces controversy_cluster_positions)
create table public.controversy_cluster_agreements (
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  agreement_cluster_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  side text,
  stance_label text,
  weight numeric,
  created_at timestamptz not null default now(),
  primary key (controversy_cluster_id, agreement_cluster_id)
);

create index if not exists idx_controversy_cluster_agreements_controversy on public.controversy_cluster_agreements(controversy_cluster_id);
create index if not exists idx_controversy_cluster_agreements_agreement on public.controversy_cluster_agreements(agreement_cluster_id);

-- 10. Create agreement_summary_cache
create table public.agreement_summary_cache (
  membership_fingerprint text primary key,
  label text,
  summary text,
  created_at timestamptz not null default now()
);

-- 11. Create agreement_cluster_migrations (lineage)
create table public.agreement_cluster_migrations (
  old_agreement_cluster_id uuid not null,
  new_agreement_cluster_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  relation text not null check (relation in ('merge', 'split')),
  created_at timestamptz not null default now()
);

create index if not exists idx_agreement_cluster_migrations_created_at on public.agreement_cluster_migrations(created_at);

-- 12. Recreate controversy_viewpoints (with agreement_cluster_id)
create table public.controversy_viewpoints (
  viewpoint_id uuid primary key default gen_random_uuid(),
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  agreement_cluster_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  title text,
  summary text not null,
  summary_ok boolean not null default false,
  version int not null default 1,
  model text,
  created_at timestamptz not null default now(),
  unique (controversy_cluster_id, agreement_cluster_id)
);

create index if not exists idx_controversy_viewpoints_controversy on public.controversy_viewpoints(controversy_cluster_id);
create index if not exists idx_controversy_viewpoints_agreement on public.controversy_viewpoints(agreement_cluster_id);

-- 13. Recreate topic_controversies
create table public.topic_controversies (
  topic_id uuid not null references public.topics(topic_id) on delete cascade,
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  similarity_score numeric not null,
  rank int not null default 0,
  linked_at timestamptz not null default now(),
  primary key (topic_id, controversy_cluster_id)
);

create index if not exists idx_topic_controversies_topic_id on public.topic_controversies(topic_id);
create index if not exists idx_topic_controversies_controversy_id on public.topic_controversies(controversy_cluster_id);

-- 14. RLS
alter table public.controversy_clusters enable row level security;
alter table public.agreement_clusters enable row level security;
alter table public.agreement_cluster_positions enable row level security;
alter table public.agreement_cluster_claims enable row level security;
alter table public.controversy_cluster_agreements enable row level security;
alter table public.agreement_summary_cache enable row level security;
alter table public.agreement_cluster_migrations enable row level security;
alter table public.controversy_viewpoints enable row level security;
alter table public.topic_controversies enable row level security;

create policy "Public read controversy_clusters" on public.controversy_clusters for select using (true);
create policy "Public read agreement_clusters" on public.agreement_clusters for select using (true);
create policy "Public read agreement_cluster_positions" on public.agreement_cluster_positions for select using (true);
create policy "Public read agreement_cluster_claims" on public.agreement_cluster_claims for select using (true);
create policy "Public read controversy_cluster_agreements" on public.controversy_cluster_agreements for select using (true);
create policy "Public read agreement_summary_cache" on public.agreement_summary_cache for select using (true);
create policy "Public read agreement_cluster_migrations" on public.agreement_cluster_migrations for select using (true);
create policy "Public read controversy_viewpoints" on public.controversy_viewpoints for select using (true);
create policy "Public read topic_controversies" on public.topic_controversies for select using (true);

-- 15. upsert_agreement_clusters_batch
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
      join public.story_position_claims spc on spc.story_position_id = sp.story_position_id
      join public.story_claims sc on sc.story_claim_id = spc.story_claim_id
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

-- 16. compute_agreement_centroids
create or replace function public.compute_agreement_centroids()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  updated_count int;
begin
  with centroids as (
    select acp.agreement_cluster_id,
      l2_normalize(avg(cp.embedding)) as centroid
    from public.agreement_cluster_positions acp
    join public.canonical_positions cp on cp.canonical_position_id = acp.canonical_position_id and cp.embedding is not null
    join public.agreement_clusters ac on ac.agreement_cluster_id = acp.agreement_cluster_id
    where ac.status = 'active'
    group by acp.agreement_cluster_id
    having count(*) >= 2
  )
  update public.agreement_clusters ac
  set centroid_embedding = c.centroid
  from centroids c
  where ac.agreement_cluster_id = c.agreement_cluster_id and c.centroid is not null;
  get diagnostics updated_count = row_count;
  return jsonb_build_object('updated_count', updated_count);
end;
$$;

-- 17. upsert_controversy_clusters_batch (agreement_cluster_id based)
-- Format: { fingerprint, topic_id, question, label, question_embedding, positions: [{ agreement_cluster_id, stance_label }, ...] }
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
  aid uuid;
  stance_lbl text;
  idx int;
  side_char text;
begin
  for c in select * from jsonb_array_elements(p_controversies)
  loop
    fp := c->>'fingerprint';
    if fp is null or fp = '' then continue; end if;
    pos_arr := c->'positions';
    if pos_arr is null or jsonb_array_length(pos_arr) < 2 then continue; end if;
    q := coalesce(nullif(trim(c->>'question'), ''), 'What is the debate?');
    q_emb := nullif(trim(c->>'question_embedding'), '');

    insert into public.controversy_clusters (topic_id, controversy_fingerprint, question, label, question_embedding, status, deactivated_at)
    values ((c->>'topic_id')::uuid, fp, q, coalesce(nullif(trim(c->>'label'), ''), q), case when q_emb is not null then q_emb::vector else null end, 'active', null)
    on conflict (controversy_fingerprint) where (controversy_fingerprint is not null)
    do update set
      topic_id = excluded.topic_id,
      question = excluded.question,
      label = coalesce(excluded.label, controversy_clusters.label),
      question_embedding = coalesce(excluded.question_embedding, controversy_clusters.question_embedding),
      status = 'active',
      deactivated_at = null
    returning controversy_cluster_id into cid;

    if cid is null then
      select controversy_cluster_id into cid from public.controversy_clusters where controversy_fingerprint = fp;
    end if;

    if cid is not null then
      kept_count := kept_count + 1;
      new_fps := array_append(new_fps, fp);

      delete from public.controversy_cluster_agreements where controversy_cluster_id = cid;

      idx := 0;
      for pos_elem in select * from jsonb_array_elements(pos_arr)
      loop
        aid := (pos_elem->>'agreement_cluster_id')::uuid;
        if aid is null then continue; end if;
        stance_lbl := coalesce(nullif(trim(pos_elem->>'stance_label'), ''), 'Position ' || chr(65 + least(idx, 25)));
        side_char := chr(65 + least(idx, 25));
        insert into public.controversy_cluster_agreements (controversy_cluster_id, agreement_cluster_id, side, stance_label)
        values (cid, aid, side_char, stance_lbl);
        idx := idx + 1;
      end loop;
    end if;
  end loop;

  for orphan_rec in
    select controversy_cluster_id from public.controversy_clusters
    where status = 'active' and controversy_fingerprint is not null
      and controversy_fingerprint != all(new_fps)
  loop
    update public.controversy_clusters set status = 'inactive', deactivated_at = now()
    where controversy_cluster_id = orphan_rec.controversy_cluster_id;
    marked_inactive_count := marked_inactive_count + 1;
  end loop;

  return jsonb_build_object('kept_count', kept_count, 'marked_inactive_count', marked_inactive_count);
end;
$$;

-- 18. match_controversies_nearest (for process_topic)
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
  select c.controversy_cluster_id,
    (c.question_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (c.question_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.controversy_clusters c
  where c.question_embedding is not null and c.status = 'active'
    and (1.0 - (c.question_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by c.question_embedding <=> query_embedding::vector
  limit match_count;
$$;

-- 19. run_orphan_cleanup (agreement_clusters, controversy_clusters)
create or replace function public.run_orphan_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  agreements_deleted int;
  controversies_deleted int;
  lineage_deleted int;
  cutoff_7d timestamptz := now() - interval '7 days';
  cutoff_30d timestamptz := now() - interval '30 days';
begin
  delete from public.agreement_clusters where status = 'inactive' and deactivated_at < cutoff_7d;
  get diagnostics agreements_deleted = row_count;
  delete from public.controversy_clusters where status = 'inactive' and deactivated_at < cutoff_7d;
  get diagnostics controversies_deleted = row_count;
  delete from public.agreement_cluster_migrations where created_at < cutoff_30d;
  get diagnostics lineage_deleted = row_count;
  return jsonb_build_object(
    'agreements_deleted', agreements_deleted,
    'controversies_deleted', controversies_deleted,
    'lineage_deleted', lineage_deleted
  );
end;
$$;

-- 20. get_daily_health_report (use agreement_clusters, controversy_clusters, controversy_viewpoints)
create or replace function public.get_daily_health_report()
returns table (
  stories_ingested bigint,
  stories_reviewed bigint,
  stories_scraped bigint,
  stories_cleaned bigint,
  pending_stories_count bigint,
  chunks_created bigint,
  chunks_extracted bigint,
  merges_completed bigint,
  story_claims_created bigint,
  story_evidence_created bigint,
  claims_created bigint,
  awaiting_scrape bigint,
  awaiting_cleaning bigint,
  awaiting_merge bigint,
  unclassified_stories bigint,
  scrape_failed bigint,
  stuck_processing bigint,
  claim_relationships_24h bigint,
  positions_24h bigint,
  controversies_24h bigint,
  viewpoints_24h bigint,
  positions_active bigint,
  controversies_active bigint,
  viewpoints_active bigint
)
language sql stable
security definer
set search_path = public, extensions
as $$
  with since as (select now() - interval '24 hours' as t)
  select
    (select count(*)::bigint from stories where created_at >= (select t from since)),
    (select count(*)::bigint from stories where relevance_ran_at >= (select t from since) and relevance_status in ('KEEP', 'DROP')),
    (select count(*)::bigint from stories where scraped_at >= (select t from since)),
    (select count(*)::bigint from story_bodies where cleaned_at >= (select t from since)),
    (select count(*)::bigint from stories where relevance_status = 'PENDING'),
    (select count(*)::bigint from story_chunks where created_at >= (select t from since)),
    (select count(*)::bigint from story_chunks where extraction_completed_at >= (select t from since)),
    (select count(*)::bigint from stories where merged_at >= (select t from since)),
    (select count(*)::bigint from story_claims where created_at >= (select t from since)),
    (select count(*)::bigint from story_evidence where created_at >= (select t from since)),
    (select count(*)::bigint from claims where created_at >= (select t from since)),
    (select count(*)::bigint from stories s left join story_bodies sb on sb.story_id = s.story_id where s.relevance_status = 'KEEP' and sb.story_id is null),
    (select count(*)::bigint from story_bodies where cleaned_at is null),
    (select count(*)::bigint from stories s where s.merged_at is null and exists (select 1 from story_chunks sc where sc.story_id = s.story_id)
     and not exists (select 1 from story_chunks sc where sc.story_id = s.story_id and sc.extraction_json is null)
     and not exists (select 1 from story_claims sc where sc.story_id = s.story_id)),
    (select count(*)::bigint from stories where relevance_status is null),
    (select count(*)::bigint from stories where scrape_skipped = true),
    (select count(*)::bigint from stories where being_processed = true),
    (select count(*)::bigint from claim_relationships where classified_at >= (select t from since)),
    (select count(*)::bigint from agreement_clusters where created_at >= (select t from since)),
    (select count(*)::bigint from controversy_clusters where created_at >= (select t from since)),
    (select count(*)::bigint from controversy_viewpoints where created_at >= (select t from since)),
    (select count(*)::bigint from agreement_clusters where status = 'active'),
    (select count(*)::bigint from controversy_clusters where status = 'active'),
    (select count(*)::bigint from controversy_viewpoints cv join controversy_clusters cc on cv.controversy_cluster_id = cc.controversy_cluster_id where cc.status = 'active');
$$;
