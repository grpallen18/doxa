-- Audit log for every scrape attempt. Enables accurate success-rate metrics.
-- Written by receive_scraped_content (Worker callback) and scrape_story_content (timeout/no-response).

create table if not exists public.scrape_log (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(story_id) on delete cascade,
  outcome text not null check (outcome in ('success', 'failure')),
  scrape_method text check (scrape_method in ('fetch_readability', 'browser_render')),
  error text,
  created_at timestamptz not null default now()
);

create index idx_scrape_log_created_at on public.scrape_log(created_at);
create index idx_scrape_log_story_id on public.scrape_log(story_id);

comment on table public.scrape_log is 'One row per scrape attempt. success/failure with optional scrape_method and error. Used for success-rate metrics and audit.';
comment on column public.scrape_log.outcome is 'success or failure';
comment on column public.scrape_log.scrape_method is 'How content was obtained (success only). fetch_readability or browser_render.';
comment on column public.scrape_log.error is 'Error message on failure.';

alter table public.scrape_log enable row level security;
-- No policy: anon gets nothing. Edge Functions use service_role and bypass RLS.
