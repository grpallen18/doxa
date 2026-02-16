-- Topic pipeline: topic_description, topic_embedding, topic_theses, topic_relationships.
-- Enables embedding-based thesis linking and topic-to-topic relationships.

-- topics: add description and embedding columns
alter table public.topics
  add column if not exists topic_description text,
  add column if not exists topic_embedding vector(1536);

comment on column public.topics.topic_description is 'LLM-generated description for initial embedding; used before summary exists.';
comment on column public.topics.topic_embedding is 'Embedding of description (initial) or title+summary (after synthesis); used for thesis and topic similarity.';

create index if not exists idx_topics_topic_embedding_hnsw
  on public.topics using hnsw (topic_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where topic_embedding is not null;

-- topic_theses: many-to-many link between topics and theses
create table if not exists public.topic_theses (
  topic_id uuid not null references public.topics(topic_id) on delete cascade,
  thesis_id uuid not null references public.theses(thesis_id) on delete cascade,
  similarity_score numeric not null,
  rank int not null default 0,
  linked_at timestamptz not null default now(),
  primary key (topic_id, thesis_id)
);

create index if not exists idx_topic_theses_topic_id on public.topic_theses(topic_id);
create index if not exists idx_topic_theses_thesis_id on public.topic_theses(thesis_id);

alter table public.topic_theses enable row level security;
create policy "Public read topic_theses" on public.topic_theses for select using (true);

-- topic_relationships: topic-to-topic links for navigation
create table if not exists public.topic_relationships (
  source_topic_id uuid not null references public.topics(topic_id) on delete cascade,
  target_topic_id uuid not null references public.topics(topic_id) on delete cascade,
  similarity_score numeric not null,
  primary key (source_topic_id, target_topic_id),
  check (source_topic_id != target_topic_id)
);

create index if not exists idx_topic_relationships_source on public.topic_relationships(source_topic_id);
create index if not exists idx_topic_relationships_target on public.topic_relationships(target_topic_id);

alter table public.topic_relationships enable row level security;
create policy "Public read topic_relationships" on public.topic_relationships for select using (true);
