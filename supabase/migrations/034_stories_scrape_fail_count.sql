-- Add scrape_fail_count to stories: tracks consecutive scrape failures.
-- When scrape_story_content gets a failed response from the Worker, it calls increment_scrape_fail_and_maybe_skip.
-- After 3 failures, scrape_skipped is set to true and the story is no longer retried.

alter table public.stories
  add column if not exists scrape_fail_count integer not null default 0;

comment on column public.stories.scrape_fail_count is 'Consecutive scrape failures (Worker 5xx, timeout, CPU exceeded). After 3, scrape_skipped is set and retries stop. Reset to 0 on success.';

create or replace function public.increment_scrape_fail_and_maybe_skip(p_story_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.stories
  set
    being_processed = false,
    scrape_fail_count = scrape_fail_count + 1,
    scrape_skipped = (scrape_fail_count + 1 >= 3)
  where story_id = p_story_id;
$$;

comment on function public.increment_scrape_fail_and_maybe_skip(uuid) is 'Called by scrape_story_content on Worker failure. Unlocks story, increments scrape_fail_count, sets scrape_skipped when count >= 3.';
