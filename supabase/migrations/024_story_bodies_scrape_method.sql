-- Add scrape_method to story_bodies: how HTML was obtained (fetch_readability | browser_render). Null on failure.
-- Run after 023_stories_scraped_at.sql.

alter table public.story_bodies
  add column if not exists scrape_method text;

comment on column public.story_bodies.scrape_method is 'How the scrape succeeded: fetch_readability (direct fetch) or browser_render (Cloudflare Browser Rendering). Null on failure.';
