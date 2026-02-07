-- story_bodies: content → content_raw, add content_clean, tracking fields, length columns.
-- Run after 025_story_bodies_content_length.sql.

alter table public.story_bodies drop column if exists content_length;

alter table public.story_bodies rename column content to content_raw;

alter table public.story_bodies
  add column if not exists content_length_raw int generated always as (length(content_raw)) stored;

alter table public.story_bodies
  add column if not exists content_clean text;

alter table public.story_bodies
  add column if not exists content_length_clean int generated always as (length(content_clean)) stored;

alter table public.story_bodies
  add column if not exists cleaned_at timestamptz;

alter table public.story_bodies
  add column if not exists cleaner_model text;

comment on column public.story_bodies.content_raw is 'Raw Readability textContent from Worker.';
comment on column public.story_bodies.content_length_raw is 'Character length of content_raw (formula).';
comment on column public.story_bodies.content_clean is 'LLM-cleaned article text; null until clean_scraped_content runs.';
comment on column public.story_bodies.content_length_clean is 'Character length of content_clean (formula). Null when content_clean is null.';
comment on column public.story_bodies.cleaned_at is 'When content was cleaned by clean_scraped_content.';
comment on column public.story_bodies.cleaner_model is 'AI model used to clean content.';
