-- Add scraped_at to stories: set when scrape succeeded; null when scrape_skipped or not yet scraped.
-- Run after 022_relevance_status_threshold_75.sql (or any prior migration).

alter table public.stories
  add column if not exists scraped_at timestamptz;

comment on column public.stories.scraped_at is 'Set when scrape succeeded; null when scrape_skipped or not yet scraped.';
