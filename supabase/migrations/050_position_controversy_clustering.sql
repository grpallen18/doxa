-- Position-Controversy Clustering: two-stage architecture.
-- Hard cutover: drop claim_clusters; create position_clusters, controversy_clusters, etc.
-- topic_id optional for V1. When required: derive from claim -> story_claims -> topic_stories.
-- Strategy: most_common_topic | intersection | first_non_null (documented for future).

-- 1. Drop old claim-level clustering (RPC references claim_clusters)
drop function if exists public.match_clusters_nearest(text, int, float);
drop table if exists public.claim_cluster_members cascade;
drop table if exists public.claim_clusters cascade;

-- 2. position_clusters: coherent stances (supporting claims grouped)
create table if not exists public.position_clusters (
  position_cluster_id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(topic_id) on delete set null,
  label text,
  summary text,
  centroid_embedding vector(1536),
  created_at timestamptz not null default now()
);

comment on table public.position_clusters is 'Coherent stance groups from supporting claim edges. Enforced MIN/MAX size via splitting.';
comment on column public.position_clusters.topic_id is 'Optional for V1. Derive from claim -> story_claims -> topic_stories. Strategy: most_common_topic.';

-- 3. position_cluster_claims: which claims belong to which position
create table if not exists public.position_cluster_claims (
  position_cluster_id uuid not null references public.position_clusters(position_cluster_id) on delete cascade,
  claim_id uuid not null references public.claims(claim_id) on delete cascade,
  weight numeric,
  role text check (role in ('core', 'supporting')),
  created_at timestamptz not null default now(),
  primary key (position_cluster_id, claim_id)
);

comment on table public.position_cluster_claims is 'Position membership. role: core | supporting for display priority.';

-- 4. position_pair_scores: aggregated cross-edges between position clusters
create table if not exists public.position_pair_scores (
  position_a_id uuid not null references public.position_clusters(position_cluster_id) on delete cascade,
  position_b_id uuid not null references public.position_clusters(position_cluster_id) on delete cascade,
  contradictory_count int not null default 0,
  competing_framing_count int not null default 0,
  supporting_count int not null default 0,
  controversy_score numeric not null default 0,
  last_aggregated_at timestamptz not null default now(),
  primary key (position_a_id, position_b_id),
  check (position_a_id < position_b_id)
);

comment on table public.position_pair_scores is 'Pre-aggregated edge counts between position clusters. controversy_score = contradictory + alpha*competing_framing.';

-- 5. controversy_clusters: debate containers (2+ opposing positions)
create table if not exists public.controversy_clusters (
  controversy_cluster_id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(topic_id) on delete set null,
  question text not null,
  proposition text,
  label text,
  summary text,
  created_at timestamptz not null default now()
);

comment on table public.controversy_clusters is 'Debate container linking 2+ opposing position clusters. question = neutral debate question.';

-- 6. controversy_cluster_positions: which positions are in which controversy
create table if not exists public.controversy_cluster_positions (
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  position_cluster_id uuid not null references public.position_clusters(position_cluster_id) on delete cascade,
  side text,
  stance_label text,
  weight numeric,
  created_at timestamptz not null default now(),
  primary key (controversy_cluster_id, position_cluster_id)
);

comment on table public.controversy_cluster_positions is 'Links positions to controversies. side: A/B for display. V1: pairs only.';

-- 7. controversy_viewpoints: LLM-generated viewpoint per (controversy, position)
create table if not exists public.controversy_viewpoints (
  viewpoint_id uuid primary key default gen_random_uuid(),
  controversy_cluster_id uuid not null references public.controversy_clusters(controversy_cluster_id) on delete cascade,
  position_cluster_id uuid not null references public.position_clusters(position_cluster_id) on delete cascade,
  title text,
  summary text not null,
  version int not null default 1,
  model text,
  created_at timestamptz not null default now(),
  unique (controversy_cluster_id, position_cluster_id)
);

comment on table public.controversy_viewpoints is 'LLM-generated viewpoint summary per position within a controversy. Versioned for audit.';

-- Indexes
create index if not exists idx_position_clusters_topic on public.position_clusters(topic_id);
create index if not exists idx_position_cluster_claims_cluster on public.position_cluster_claims(position_cluster_id);
create index if not exists idx_position_cluster_claims_claim on public.position_cluster_claims(claim_id);
create index if not exists idx_position_pair_scores_a on public.position_pair_scores(position_a_id);
create index if not exists idx_position_pair_scores_b on public.position_pair_scores(position_b_id);
create index if not exists idx_controversy_clusters_topic on public.controversy_clusters(topic_id);
create index if not exists idx_controversy_cluster_positions_controversy on public.controversy_cluster_positions(controversy_cluster_id);
create index if not exists idx_controversy_cluster_positions_position on public.controversy_cluster_positions(position_cluster_id);
create index if not exists idx_controversy_viewpoints_controversy on public.controversy_viewpoints(controversy_cluster_id);
create index if not exists idx_controversy_viewpoints_position on public.controversy_viewpoints(position_cluster_id);

-- RLS
alter table public.position_clusters enable row level security;
alter table public.position_cluster_claims enable row level security;
alter table public.position_pair_scores enable row level security;
alter table public.controversy_clusters enable row level security;
alter table public.controversy_cluster_positions enable row level security;
alter table public.controversy_viewpoints enable row level security;

create policy "Public read position_clusters" on public.position_clusters for select using (true);
create policy "Public read position_cluster_claims" on public.position_cluster_claims for select using (true);
create policy "Public read position_pair_scores" on public.position_pair_scores for select using (true);
create policy "Public read controversy_clusters" on public.controversy_clusters for select using (true);
create policy "Public read controversy_cluster_positions" on public.controversy_cluster_positions for select using (true);
create policy "Public read controversy_viewpoints" on public.controversy_viewpoints for select using (true);
