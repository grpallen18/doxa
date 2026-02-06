-- story_bodies: full article text (from Worker scrape); stories keeps only status flags.
-- domain_throttle: per-domain cooldown for scrape_story_content.
-- Run after 016_stories_scraped_content.sql. Drops scraped_content on stories; no data migration.

-- Full article text; one row per story. Chunking/embeddings can reference this.
create table if not exists public.story_bodies (
  story_id uuid primary key references public.stories(story_id) on delete cascade,
  content text not null,
  extracted_at timestamptz not null default now(),
  extractor_version text
);

comment on table public.story_bodies is 'Full article text scraped from story URL; stories table keeps only scrape status flags.';
comment on column public.story_bodies.content is 'Readability textContent from Worker.';
comment on column public.story_bodies.extracted_at is 'When the body was scraped.';
comment on column public.story_bodies.extractor_version is 'Optional version identifier for the scraper.';

-- Per-domain throttle: minimum interval between scrapes per hostname.
create table if not exists public.domain_throttle (
  domain text primary key,
  last_dispatched_at timestamptz not null default now()
);

comment on table public.domain_throttle is 'Last time a scrape was dispatched per domain; used by scrape_story_content to space out requests.';

-- Drop scraped_content; full text lives in story_bodies. No migration of existing values.
alter table public.stories drop column if exists scraped_content;
