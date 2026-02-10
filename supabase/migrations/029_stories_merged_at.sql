-- merged_at: set when merge_story_claims has run for this story (even if 0 claims).
-- Ensures we don't re-pick the same story and block the queue when LLM returns empty.

alter table public.stories
  add column if not exists merged_at timestamptz;

comment on column public.stories.merged_at is 'Set when merge_story_claims has run for this story; null means not yet merged. Prevents re-processing empty-merge stories.';

create index if not exists idx_stories_merged_at_null
  on public.stories (created_at)
  where merged_at is null;
