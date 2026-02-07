-- Extraction status for stories (for future claim-extraction step).
-- Run after 014_stories_being_processed.sql.

alter table public.stories
  add column if not exists extraction_completed_at timestamptz,
  add column if not exists extraction_skipped_empty boolean not null default false;

comment on column public.stories.extraction_completed_at is 'Set only when extraction wrote at least one claim or evidence; null means not yet processed or processed but skipped (no claims/evidence).';
comment on column public.stories.extraction_skipped_empty is 'True when extraction ran but the LLM found no claims or evidence; extraction_completed_at stays null. Used to avoid re-running.';

-- Index for cron: find stories ready for extraction (KEEP, never completed extraction, not skipped-empty).
create index if not exists idx_stories_extraction_ready
  on public.stories (created_at)
  where relevance_status = 'KEEP' and extraction_completed_at is null and extraction_skipped_empty = false and not being_processed;
