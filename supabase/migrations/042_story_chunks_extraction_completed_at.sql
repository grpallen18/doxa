-- Add extraction_completed_at to story_chunks for pipeline progress tracking.
-- Set by extract_chunk_claims when it writes extraction_json.

alter table public.story_chunks
  add column if not exists extraction_completed_at timestamptz;

comment on column public.story_chunks.extraction_completed_at is 'When extract_chunk_claims wrote extraction_json; null until extraction runs.';

create index if not exists idx_story_chunks_extraction_completed_at
  on public.story_chunks (extraction_completed_at)
  where extraction_completed_at is not null;
