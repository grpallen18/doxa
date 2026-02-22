-- Purge DROP stories older than 30 days to reduce storage.
-- Cascade deletes story_bodies, story_chunks, story_claims, story_evidence, topic_stories.
-- Called by purge-drop-stories-monthly cron.

create or replace function public.purge_drop_stories()
returns bigint
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.stories
    where relevance_status = 'DROP'
      and created_at < now() - interval '30 days'
    returning story_id
  )
  select count(*)::bigint from deleted;
$$;

comment on function public.purge_drop_stories() is 'Deletes stories with relevance_status = DROP and created_at older than 30 days. Returns count deleted. Cascade removes story_bodies, story_chunks, story_claims, story_evidence, topic_stories. Run monthly via cron.';
