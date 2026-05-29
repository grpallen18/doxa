-- Rename processing pipeline edge functions: extract_chunk_claims -> extract_story_entities,
-- merge_story_claims -> merge_story_entities. Unschedule legacy pg_cron jobs; run step schedule.sql for new URLs.

do $$ begin perform cron.unschedule('extract-chunk-claims-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('merge-story-claims-every-2min'); exception when others then null; end $$;
-- Prior partial rename may have scheduled merge-story-entities with the old merge_story_claims URL.
do $$ begin perform cron.unschedule('merge-story-entities-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('extract-story-entities-every-2min'); exception when others then null; end $$;

comment on column public.story_chunks.extraction_json is
  'Chunk-level extraction: claims, evidence, positions, events, and link arrays. Populated by extract_story_entities.';

comment on column public.story_chunks.extraction_completed_at is
  'When extract_story_entities wrote extraction_json; null until extraction runs.';

comment on column public.stories.merged_at is
  'Set when merge_story_entities has run for this story; null means not yet merged. Prevents re-processing empty-merge stories.';

comment on function public.get_stories_ready_to_merge(int) is
  'Returns story_ids ready for merge_story_entities (all chunks extracted, no story-level entities yet). Ordered by created_at asc.';
