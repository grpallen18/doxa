-- Relevance classification for stories (cron #2: classify ingested stories into KEEP/DROP).
-- Run once after 011_new_schema_pgvector.sql.

alter table public.stories
  add column if not exists relevance_status text,              -- KEEP | DROP | PENDING
  add column if not exists relevance_score integer,            -- 0-100, NULL when PENDING
  add column if not exists relevance_confidence integer,       -- 0-100
  add column if not exists relevance_reason text,
  add column if not exists relevance_tags text[],
  add column if not exists relevance_model text,
  add column if not exists relevance_ran_at timestamptz;

-- Helpful index for cron #2 (find unclassified stories by recency)
create index if not exists idx_stories_relevance_null_recent
  on public.stories (created_at)
  where relevance_status is null;
