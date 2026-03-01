-- Topics schema alterations, subtopics, position_subtopics.
-- Alters existing topics: add name (controlled vocab), deprecate title.
-- Creates subtopics and position_subtopics. Taxonomy seeded in 103.

set search_path = public, extensions;

-- 1. Alter topics: add name column (controlled vocab). Keep title for backward compat.
alter table public.topics add column if not exists name text;
comment on column public.topics.name is 'Controlled vocab name for taxonomy. Deprecates title for position-first schema.';

-- 2. subtopics: child of topics, has embedding for retrieval
create table if not exists public.subtopics (
  subtopic_id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(topic_id) on delete cascade,
  name text not null,
  description text,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

comment on table public.subtopics is 'Controlled subtopics per topic. Used for ranked assignment to canonical positions.';

create index if not exists idx_subtopics_topic on public.subtopics(topic_id);
create index if not exists idx_subtopics_embedding_hnsw
  on public.subtopics using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

-- 3. position_subtopics: ranked subtopic assignment per canonical position (1-5)
create table if not exists public.position_subtopics (
  canonical_position_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  subtopic_id uuid not null references public.subtopics(subtopic_id) on delete cascade,
  rank smallint not null check (rank >= 1 and rank <= 5),
  confidence numeric,
  primary key (canonical_position_id, rank)
);

comment on table public.position_subtopics is 'Ranked subtopic assignment (1-5) per canonical position. Rank 1 defines primary_topic_id.';

create index if not exists idx_position_subtopics_position on public.position_subtopics(canonical_position_id);
create index if not exists idx_position_subtopics_subtopic on public.position_subtopics(subtopic_id);

-- 4. match_subtopics_nearest: retrieval for assign_ranked_subtopics
create or replace function public.match_subtopics_nearest(
  query_embedding text,
  match_count int default 25
)
returns table (subtopic_id uuid, distance float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select s.subtopic_id, (s.embedding <=> query_embedding::vector)::float as distance
  from public.subtopics s
  where s.embedding is not null
  order by s.embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_subtopics_nearest(text, int) is 'KNN for subtopics. Used by assign_ranked_subtopics.';

-- RLS
alter table public.subtopics enable row level security;
alter table public.position_subtopics enable row level security;

create policy "Public read subtopics" on public.subtopics for select using (true);
create policy "Public read position_subtopics" on public.position_subtopics for select using (true);
