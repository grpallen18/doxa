-- Topology pipeline: candidate queues, expanded relationship taxonomies, cluster relationships, lineage.
-- Replaces position_relationships relation+alignment with relationship_kind.

set search_path = public, extensions;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'position_relationship_kind') then
    create type public.position_relationship_kind as enum (
      'same_family', 'agree', 'oppose', 'qualify', 'broader', 'narrower',
      'compatible', 'orthogonal', 'unrelated'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'agreement_cluster_relationship_kind') then
    create type public.agreement_cluster_relationship_kind as enum (
      'opposed', 'competing', 'compatible', 'orthogonal', 'nested', 'partially_overlapping'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'candidate_status') then
    create type public.candidate_status as enum ('pending', 'classified', 'expired', 'skipped');
  end if;
  if not exists (select 1 from pg_type where typname = 'agreement_membership_kind') then
    create type public.agreement_membership_kind as enum ('core', 'attached');
  end if;
end $$;

-- position_pair_candidates
create table if not exists public.position_pair_candidates (
  position_a_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  position_b_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  score numeric not null default 0,
  signals jsonb not null default '{}'::jsonb,
  status public.candidate_status not null default 'pending',
  created_at timestamptz not null default now(),
  ranked_at timestamptz not null default now(),
  primary key (position_a_id, position_b_id),
  check (position_a_id < position_b_id)
);

create index if not exists idx_position_pair_candidates_pending_score
  on public.position_pair_candidates (status, score desc)
  where status = 'pending';

-- Replace position_relationships columns
truncate table public.position_relationships;

alter table public.position_relationships
  drop column if exists relation,
  drop column if exists alignment;

alter table public.position_relationships
  add column if not exists relationship_kind public.position_relationship_kind not null default 'unrelated';

alter table public.position_relationships
  alter column relationship_kind drop default;

comment on table public.position_relationships is
  'LLM-classified relationships between canonical positions. same_family/agree drive core agreement clusters.';

drop type if exists public.position_relation cascade;
drop type if exists public.position_alignment cascade;

-- agreement_cluster_positions: core vs attached membership
alter table public.agreement_cluster_positions
  add column if not exists membership_kind public.agreement_membership_kind not null default 'core';

comment on column public.agreement_cluster_positions.membership_kind is
  'core = hard-union member; attached = qualify/broader/narrower soft link excluded from fingerprint.';

-- agreement_cluster_pair_candidates
create table if not exists public.agreement_cluster_pair_candidates (
  agreement_cluster_a_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  agreement_cluster_b_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  score numeric not null default 0,
  signals jsonb not null default '{}'::jsonb,
  status public.candidate_status not null default 'pending',
  created_at timestamptz not null default now(),
  ranked_at timestamptz not null default now(),
  primary key (agreement_cluster_a_id, agreement_cluster_b_id),
  check (agreement_cluster_a_id < agreement_cluster_b_id)
);

create index if not exists idx_agreement_cluster_pair_candidates_pending_score
  on public.agreement_cluster_pair_candidates (status, score desc)
  where status = 'pending';

-- agreement_cluster_relationships
create table if not exists public.agreement_cluster_relationships (
  agreement_cluster_relationship_id uuid primary key default gen_random_uuid(),
  agreement_cluster_a_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  agreement_cluster_b_id uuid not null references public.agreement_clusters(agreement_cluster_id) on delete cascade,
  relationship_kind public.agreement_cluster_relationship_kind not null,
  rationale text,
  confidence numeric,
  signals jsonb not null default '{}'::jsonb,
  classified_at timestamptz not null default now(),
  model text,
  unique (agreement_cluster_a_id, agreement_cluster_b_id),
  check (agreement_cluster_a_id < agreement_cluster_b_id)
);

create index if not exists idx_agreement_cluster_relationships_a
  on public.agreement_cluster_relationships (agreement_cluster_a_id);
create index if not exists idx_agreement_cluster_relationships_b
  on public.agreement_cluster_relationships (agreement_cluster_b_id);
create index if not exists idx_agreement_cluster_relationships_kind
  on public.agreement_cluster_relationships (relationship_kind);

-- controversy_cluster_lineage
create table if not exists public.controversy_cluster_lineage (
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  agreement_cluster_relationship_id uuid not null references public.agreement_cluster_relationships(agreement_cluster_relationship_id) on delete cascade,
  primary key (controversy_cluster_id, agreement_cluster_relationship_id)
);

create index if not exists idx_controversy_cluster_lineage_controversy
  on public.controversy_cluster_lineage (controversy_cluster_id);

-- RLS
alter table public.position_pair_candidates enable row level security;
alter table public.agreement_cluster_pair_candidates enable row level security;
alter table public.agreement_cluster_relationships enable row level security;
alter table public.controversy_cluster_lineage enable row level security;

create policy "Public read position_pair_candidates" on public.position_pair_candidates for select using (true);
create policy "Public read agreement_cluster_pair_candidates" on public.agreement_cluster_pair_candidates for select using (true);
create policy "Public read agreement_cluster_relationships" on public.agreement_cluster_relationships for select using (true);
create policy "Public read controversy_cluster_lineage" on public.controversy_cluster_lineage for select using (true);

-- dequeue_position_pair_candidates
create or replace function public.dequeue_position_pair_candidates(p_limit int default 30)
returns setof public.position_pair_candidates
language sql stable
security definer
set search_path = public, extensions
as $$
  select *
  from public.position_pair_candidates
  where status = 'pending'
  order by score desc, ranked_at asc
  limit greatest(p_limit, 1);
$$;

-- dequeue_agreement_cluster_pair_candidates
create or replace function public.dequeue_agreement_cluster_pair_candidates(p_limit int default 20)
returns setof public.agreement_cluster_pair_candidates
language sql stable
security definer
set search_path = public, extensions
as $$
  select *
  from public.agreement_cluster_pair_candidates
  where status = 'pending'
  order by score desc, ranked_at asc
  limit greatest(p_limit, 1);
$$;

-- match_agreement_clusters_nearest_in_topic
create or replace function public.match_agreement_clusters_nearest_in_topic(
  query_embedding text,
  topic_id uuid,
  match_count int default 10
)
returns table (agreement_cluster_id uuid, distance float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select ac.agreement_cluster_id,
    (ac.centroid_embedding <=> query_embedding::vector)::float as distance
  from public.agreement_clusters ac
  where ac.status = 'active'
    and ac.topic_id = match_agreement_clusters_nearest_in_topic.topic_id
    and ac.centroid_embedding is not null
  order by ac.centroid_embedding <=> query_embedding::vector
  limit greatest(match_count, 1);
$$;

-- upsert_agreement_clusters_batch: core vs attached positions
create or replace function public.upsert_agreement_clusters_batch(p_clusters jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c jsonb;
  fp text;
  core_ids uuid[];
  attached_ids uuid[];
  all_ids uuid[];
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

    select array_agg(x::uuid order by x::text) into core_ids
    from jsonb_array_elements_text(coalesce(c->'core_position_ids', c->'canonical_position_ids')) as x;

    select array_agg(x::uuid order by x::text) into attached_ids
    from jsonb_array_elements_text(coalesce(c->'attached_position_ids', '[]'::jsonb)) as x;

    if core_ids is null or array_length(core_ids, 1) < 2 then continue; end if;

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

      insert into public.agreement_cluster_positions (agreement_cluster_id, canonical_position_id, membership_kind)
      select aid, unnest(core_ids), 'core'::public.agreement_membership_kind;

      if attached_ids is not null and array_length(attached_ids, 1) > 0 then
        insert into public.agreement_cluster_positions (agreement_cluster_id, canonical_position_id, membership_kind)
        select aid, unnest(attached_ids), 'attached'::public.agreement_membership_kind
        on conflict do nothing;
      end if;

      select array_agg(distinct x) into all_ids
      from unnest(core_ids || coalesce(attached_ids, array[]::uuid[])) as x;

      delete from public.agreement_cluster_claims where agreement_cluster_id = aid;
      insert into public.agreement_cluster_claims (agreement_cluster_id, claim_id)
      select distinct aid, sc.claim_id
      from public.story_positions sp
      join public.story_position_claim_links spcl on spcl.story_position_id = sp.story_position_id
      join public.story_claims sc on sc.story_claim_id = spcl.story_claim_id
      where sp.canonical_position_id = any(all_ids) and sc.claim_id is not null;
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

-- compute_agreement_centroids: core members only
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
    where ac.status = 'active' and acp.membership_kind = 'core'
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

-- upsert_controversy_clusters_batch: optional lineage_relationship_ids
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
  rel_id uuid;
  rel_elem jsonb;
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

      delete from public.controversy_cluster_lineage where controversy_cluster_id = cid;
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

      for rel_elem in select * from jsonb_array_elements(coalesce(c->'lineage_relationship_ids', '[]'::jsonb))
      loop
        rel_id := (rel_elem#>>'{}')::uuid;
        if rel_id is null then
          rel_id := (rel_elem->>'agreement_cluster_relationship_id')::uuid;
        end if;
        if rel_id is not null then
          insert into public.controversy_cluster_lineage (controversy_cluster_id, agreement_cluster_relationship_id)
          values (cid, rel_id)
          on conflict do nothing;
        end if;
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
