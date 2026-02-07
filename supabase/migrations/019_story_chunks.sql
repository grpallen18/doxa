-- story_chunks: text chunks from story_bodies for downstream processing (e.g. extraction, embeddings).
-- Chunking: 3500 chars per chunk, 500 overlap. Written by chunk_story_bodies Edge Function.

create table if not exists public.story_chunks (
  story_id uuid not null references public.stories(story_id) on delete cascade,
  chunk_index smallint not null,
  content text not null,
  created_at timestamptz not null default now(),
  primary key (story_id, chunk_index)
);

create index if not exists idx_story_chunks_story_id on public.story_chunks(story_id);

comment on table public.story_chunks is 'Text chunks from story_bodies for downstream processing (e.g. extraction, embeddings).';
comment on column public.story_chunks.chunk_index is '0-based order of chunk within the story.';

alter table public.story_chunks enable row level security;

create policy "Public read story_chunks" on public.story_chunks for select using (true);
