-- Add scraped_content and scrape_skipped for scraper; content_full stays from NewsAPI.
-- Run after 015_stories_extraction_status_fields.sql.

alter table public.stories
  add column if not exists scraped_content text,
  add column if not exists scrape_skipped boolean not null default false;

comment on column public.stories.scraped_content is 'Body text scraped from story URL; content_full is from NewsAPI and is not overwritten.';
comment on column public.stories.scrape_skipped is 'True when this story cannot be scraped (URL is null or scrape failed); ensures we assess every story and do not retry unscrapable ones.';

create index if not exists idx_stories_scrape_candidates
  on public.stories (created_at)
  where relevance_status = 'KEEP' and not scrape_skipped and not being_processed;
