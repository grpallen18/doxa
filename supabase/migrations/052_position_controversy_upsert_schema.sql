-- Position-Controversy Upsert Schema: fingerprints, status, cache, lineage.
-- Enables iterative upsert instead of wipe-and-recreate for 100% uptime.

-- Ensure pgcrypto for digest (enable in Dashboard if needed)
create extension if not exists pgcrypto;

-- 1. position_clusters: add membership_fingerprint, status, deactivated_at
alter table public.position_clusters
  add column if not exists membership_fingerprint text,
  add column if not exists status text not null default 'active',
  add column if not exists deactivated_at timestamptz;

comment on column public.position_clusters.membership_fingerprint is 'SHA256 of sorted claim_ids; used for upsert to preserve cluster_id when membership unchanged.';
comment on column public.position_clusters.status is 'active | inactive. Inactive = orphan marked for later deletion (grace period).';
comment on column public.position_clusters.deactivated_at is 'When marked inactive; null = active.';

-- Backfill membership_fingerprint from position_cluster_claims
with claim_sets as (
  select
    pcc.position_cluster_id,
    encode(extensions.digest(string_agg(pcc.claim_id::text, '|' order by pcc.claim_id), 'sha256'), 'hex') as fp
  from public.position_cluster_claims pcc
  group by pcc.position_cluster_id
)
update public.position_clusters pc
set membership_fingerprint = cs.fp
from claim_sets cs
where pc.position_cluster_id = cs.position_cluster_id
  and pc.membership_fingerprint is null;

-- Add unique constraint (after backfill; allow null for any stragglers)
create unique index if not exists idx_position_clusters_membership_fingerprint
  on public.position_clusters (membership_fingerprint)
  where membership_fingerprint is not null;

-- 2. controversy_clusters: add controversy_fingerprint, status, deactivated_at
alter table public.controversy_clusters
  add column if not exists controversy_fingerprint text,
  add column if not exists status text not null default 'active',
  add column if not exists deactivated_at timestamptz;

comment on column public.controversy_clusters.controversy_fingerprint is 'SHA256 of sorted position_cluster_ids; used for upsert.';
comment on column public.controversy_clusters.status is 'active | inactive. Inactive = orphan marked for later deletion (grace period).';
comment on column public.controversy_clusters.deactivated_at is 'When marked inactive; null = active.';

-- Backfill controversy_fingerprint from controversy_cluster_positions
with pos_sets as (
  select
    ccp.controversy_cluster_id,
    encode(extensions.digest(string_agg(ccp.position_cluster_id::text, '|' order by ccp.position_cluster_id), 'sha256'), 'hex') as fp
  from public.controversy_cluster_positions ccp
  group by ccp.controversy_cluster_id
)
update public.controversy_clusters cc
set controversy_fingerprint = ps.fp
from pos_sets ps
where cc.controversy_cluster_id = ps.controversy_cluster_id
  and cc.controversy_fingerprint is null;

create unique index if not exists idx_controversy_clusters_controversy_fingerprint
  on public.controversy_clusters (controversy_fingerprint)
  where controversy_fingerprint is not null;

-- 3. position_summary_cache: cache label/summary by membership fingerprint
create table if not exists public.position_summary_cache (
  membership_fingerprint text primary key,
  label text,
  summary text,
  created_at timestamptz not null default now()
);

comment on table public.position_summary_cache is 'LLM-generated label/summary keyed by membership fingerprint. Persists across rebuilds; avoids re-calling LLM when position unchanged.';

-- 4. position_cluster_migrations: lineage for merge/split
create table if not exists public.position_cluster_migrations (
  old_position_cluster_id uuid not null,
  new_position_cluster_id uuid not null references public.position_clusters(position_cluster_id) on delete cascade,
  relationship text not null check (relationship in ('merged_into', 'split_into')),
  created_at timestamptz not null default now()
);

comment on table public.position_cluster_migrations is 'Lineage when positions merge or split. old_id has no FK (may be deleted). Purge rows older than 30 days.';

create index if not exists idx_position_cluster_migrations_created_at
  on public.position_cluster_migrations (created_at);

-- RLS for new table
alter table public.position_summary_cache enable row level security;
alter table public.position_cluster_migrations enable row level security;

create policy "Public read position_summary_cache" on public.position_summary_cache for select using (true);
create policy "Public read position_cluster_migrations" on public.position_cluster_migrations for select using (true);
