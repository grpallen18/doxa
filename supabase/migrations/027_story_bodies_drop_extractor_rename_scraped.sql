-- story_bodies: drop obsolete extractor_version, rename extracted_at to scraped_at.
-- Run after 026_story_bodies_content_raw_clean.sql.

alter table public.story_bodies drop column if exists extractor_version;

alter table public.story_bodies rename column extracted_at to scraped_at;

comment on column public.story_bodies.scraped_at is 'When the body was scraped.';
