-- Canonical positions layer for position-first architecture.
-- Runs first; story_positions (099) FK requires this table.
-- RPCs: match_positions_nearest, match_positions_nearest_in_topic.

set search_path = public, extensions;

-- canonical_positions: deduplicated position statements, linked from story_positions
create table if not exists public.canonical_positions (
  canonical_position_id uuid primary key default gen_random_uuid(),
  canonical_text text not null,
  canonical_hash text not null unique,
  embedding vector(1536),
  primary_topic_id uuid references public.topics(topic_id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.canonical_positions is 'Canonical position statements; linked from story_positions. primary_topic_id derived from rank=1 subtopic.';
comment on column public.canonical_positions.canonical_hash is 'SHA256 of normalized text; used for dedup.';
comment on column public.canonical_positions.primary_topic_id is 'Denormalized from rank=1 subtopic; updated by assign_ranked_subtopics.';

-- HNSW index for nearest-neighbor search
create index if not exists idx_canonical_positions_embedding_hnsw
  on public.canonical_positions using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

-- B-tree for topic-scoped queries
create index if not exists idx_canonical_positions_primary_topic
  on public.canonical_positions(primary_topic_id)
  where primary_topic_id is not null;

-- match_positions_nearest: global KNN, no topic filter. Used by link_canonical_positions.
create or replace function public.match_positions_nearest(
  query_embedding text,
  match_count int default 10
)
returns table (canonical_position_id uuid, distance float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select cp.canonical_position_id, (cp.embedding <=> query_embedding::vector)::float as distance
  from public.canonical_positions cp
  where cp.embedding is not null
  order by cp.embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_positions_nearest(text, int) is 'Global KNN for canonical positions. Used by link_canonical_positions.';

-- match_positions_nearest_in_topic: topic-scoped KNN. Used by classify_position_pairs Stream A.
create or replace function public.match_positions_nearest_in_topic(
  query_embedding text,
  topic_id uuid,
  match_count int default 10
)
returns table (canonical_position_id uuid, distance float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select cp.canonical_position_id, (cp.embedding <=> query_embedding::vector)::float as distance
  from public.canonical_positions cp
  where cp.primary_topic_id = topic_id
    and cp.embedding is not null
  order by cp.embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_positions_nearest_in_topic(text, uuid, int) is 'Topic-scoped KNN for canonical positions. Used by classify_position_pairs Stream A.';

-- RLS
alter table public.canonical_positions enable row level security;
create policy "Public read canonical_positions" on public.canonical_positions for select using (true);
