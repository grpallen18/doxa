-- Claim cluster engine: claim_clusters, claim_cluster_members, claim_relationships.
-- Replaces editorial thesis model with structural cross-claim controversy clusters.

-- claim_clusters: global clusters of semantically related but competing claims
create table if not exists public.claim_clusters (
  cluster_id uuid primary key default gen_random_uuid(),
  cluster_fingerprint text not null unique,
  centroid_embedding vector(1536),
  controversy_score numeric,
  total_support_count int not null default 0,
  distinct_source_count int not null default 0,
  dominant_claim_ratio numeric,
  claim_count int not null default 0,
  cluster_label text,
  cluster_label_computed_at timestamptz,
  last_computed_at timestamptz default now(),
  seeded_from_thesis boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.claim_clusters is 'Cross-claim controversy clusters (theses). Deterministic fingerprint enables stable cluster_id across runs.';
comment on column public.claim_clusters.cluster_fingerprint is 'Hash of sorted claim_ids; used for upsert to preserve cluster_id when membership unchanged.';
comment on column public.claim_clusters.centroid_embedding is 'Mean of member claim embeddings.';
comment on column public.claim_clusters.controversy_score is 'Entropy + diversity - dominance; higher = more balanced competition.';
comment on column public.claim_clusters.seeded_from_thesis is 'True if migrated from old thesis; let new engine reorganize.';

-- claim_cluster_members: which claims belong to which cluster
create table if not exists public.claim_cluster_members (
  cluster_id uuid not null references public.claim_clusters(cluster_id) on delete cascade,
  claim_id uuid not null references public.claims(claim_id) on delete cascade,
  membership_score numeric,
  support_count int not null default 0,
  distinct_source_count int not null default 0,
  rank int not null default 0,
  created_at timestamptz not null default now(),
  primary key (cluster_id, claim_id)
);

comment on table public.claim_cluster_members is 'Cluster membership. Rank by distinct_source_count DESC, support_count DESC for viewpoint display.';
comment on column public.claim_cluster_members.membership_score is 'Similarity to centroid; internal/diagnostics only, not for UI ranking.';

-- claim_relationships: cache of LLM contradiction classifications (claim_a_id < claim_b_id)
create table if not exists public.claim_relationships (
  claim_a_id uuid not null references public.claims(claim_id) on delete cascade,
  claim_b_id uuid not null references public.claims(claim_id) on delete cascade,
  relationship text not null check (relationship in ('supports_same_position', 'contradicts', 'orthogonal', 'competing_framing')),
  similarity_at_classification numeric,
  classified_at timestamptz not null default now(),
  primary key (claim_a_id, claim_b_id),
  check (claim_a_id < claim_b_id)
);

comment on table public.claim_relationships is 'LLM result cache for claim pair classification. Avoids re-classifying same pair.';

-- claims: add cluster_computed_at for incremental detection
alter table public.claims
  add column if not exists cluster_computed_at timestamptz;

comment on column public.claims.cluster_computed_at is 'Set when claim processed by claim_cluster_nightly; null means not yet clustered.';

-- Indexes
create index if not exists idx_claim_clusters_centroid_hnsw
  on public.claim_clusters using hnsw (centroid_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where centroid_embedding is not null;

create index if not exists idx_claim_clusters_last_computed
  on public.claim_clusters(last_computed_at);

create index if not exists idx_claim_clusters_controversy
  on public.claim_clusters(controversy_score);

create index if not exists idx_claim_cluster_members_cluster
  on public.claim_cluster_members(cluster_id);

create index if not exists idx_claim_cluster_members_claim
  on public.claim_cluster_members(claim_id);

create index if not exists idx_claim_relationships_lookup
  on public.claim_relationships(claim_a_id, claim_b_id);

-- RLS
alter table public.claim_clusters enable row level security;
alter table public.claim_cluster_members enable row level security;
alter table public.claim_relationships enable row level security;

create policy "Public read claim_clusters" on public.claim_clusters for select using (true);
create policy "Public read claim_cluster_members" on public.claim_cluster_members for select using (true);
create policy "Public read claim_relationships" on public.claim_relationships for select using (true);
