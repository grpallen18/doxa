-- Canonical events layer. Story tables in 118_story_events.sql (FK to events).

set search_path = public, extensions;

create table if not exists public.events (
  event_id uuid primary key default gen_random_uuid(),
  canonical_text text not null,
  canonical_hash text not null unique,
  blocking_key text not null,
  primary_actor text,
  action text,
  object text,
  event_date date,
  event_timeframe_start date,
  event_timeframe_end date,
  location text,
  event_type text,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.events is 'Canonical factual occurrences; linked from story_events via blocking_key + embedding.';
comment on column public.events.blocking_key is 'normalize(actor)|normalize(action)|YYYY-MM|topic_hint for candidate filtering.';
comment on column public.events.canonical_hash is 'SHA256 of normalized text; dedup safety net.';

create index if not exists idx_events_blocking_key on public.events(blocking_key);

create index if not exists idx_events_embedding_hnsw
  on public.events using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

create or replace function public.match_events_nearest(
  query_embedding text,
  p_blocking_key text,
  match_count int default 10
)
returns table (event_id uuid, distance float)
language sql stable
security definer
set search_path = public, extensions
as $$
  select e.event_id, (e.embedding <=> query_embedding::vector)::float as distance
  from public.events e
  where e.blocking_key = p_blocking_key
    and e.embedding is not null
  order by e.embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_events_nearest(text, text, int) is 'Blocking-key-scoped KNN for canonical events. Used by link_canonical_events.';

alter table public.events enable row level security;
create policy "Public read events" on public.events for select using (true);
