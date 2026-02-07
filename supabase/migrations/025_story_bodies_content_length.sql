-- Add content_length as a generated column: character length of content.
-- Run after 024_story_bodies_scrape_method.sql.

alter table public.story_bodies
  add column if not exists content_length int generated always as (length(content)) stored;

comment on column public.story_bodies.content_length is 'Character length of content (formula field).';
