-- Tighten relevance_status: 75 threshold for KEEP; low confidence + score < 75 -> DROP; low confidence + score >= 75 -> PENDING.
-- Run after 013_stories_relevance_status_generated.sql.

drop index if exists public.idx_stories_relevance_null_recent;

alter table public.stories
  drop column if exists relevance_status;

alter table public.stories
  add column relevance_status text generated always as (
    case
      when relevance_ran_at is null then null
      when relevance_score is null then 'PENDING'
      when relevance_confidence < 60 and relevance_score < 75 then 'DROP'
      when relevance_confidence < 60 then 'PENDING'
      when relevance_score >= 75 then 'KEEP'
      else 'DROP'
    end
  ) stored;

create index idx_stories_relevance_null_recent
  on public.stories (created_at)
  where relevance_status is null;
