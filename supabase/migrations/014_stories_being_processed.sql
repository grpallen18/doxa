-- Add lock column so relevance_gate can mark rows as in-progress and avoid overlapping cron runs.
-- Run after 013_stories_relevance_status_generated.sql.

alter table public.stories
  add column if not exists being_processed boolean not null default false;

comment on column public.stories.being_processed is 'True while relevance_gate is processing this story; prevents overlapping cron runs from picking the same row.';
