-- When a PENDING story hits 3 scrape failures and gets scrape_skipped, also force relevance_status = 'DROP'.
-- relevance_status is a generated column, so we set relevance_score=0 and relevance_confidence=100 (same as review_pending_stories when it drops).
-- PENDING stories need full content to be re-reviewed; if we can't scrape them, they stay stuck. Marking as DROP clears the backlog.

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
    scrape_skipped = (scrape_fail_count + 1 >= 3),
    relevance_score = case
      when (scrape_fail_count + 1 >= 3)
        and (relevance_score is null or (coalesce(relevance_confidence, 0) < 60 and coalesce(relevance_score, 0) >= 50))
      then 0
      else relevance_score
    end,
    relevance_confidence = case
      when (scrape_fail_count + 1 >= 3)
        and (relevance_score is null or (coalesce(relevance_confidence, 0) < 60 and coalesce(relevance_score, 0) >= 50))
      then 100
      else relevance_confidence
    end
  where story_id = p_story_id;
$$;

comment on function public.increment_scrape_fail_and_maybe_skip(uuid) is 'Called by scrape_story_content on Worker failure. Unlocks story, increments scrape_fail_count, sets scrape_skipped when count >= 3. For PENDING stories, also sets relevance_score=0 and relevance_confidence=100 so relevance_status becomes DROP and they do not stay stuck.';
