-- RPC: Pipeline progress for last 24 hours + current pending backlog.
-- Use for monitoring edge function throughput and identifying stalled issues.

create or replace function public.get_pipeline_progress_24h()
returns table (
  stories_ingested bigint,
  stories_reviewed bigint,
  stories_scraped bigint,
  stories_cleaned bigint,
  pending_stories_count bigint,
  chunks_created bigint,
  chunks_extracted bigint,
  merges_completed bigint,
  story_claims_created bigint,
  story_evidence_created bigint,
  claims_created bigint,
  theses_created bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - interval '24 hours' as t)
  select
    (select count(*)::bigint from stories where created_at >= (select t from since)),
    (select count(*)::bigint from stories
     where relevance_ran_at >= (select t from since)
     and relevance_status in ('KEEP', 'DROP')),
    (select count(*)::bigint from stories where scraped_at >= (select t from since)),
    (select count(*)::bigint from story_bodies where cleaned_at >= (select t from since)),
    (select count(*)::bigint from stories where relevance_status = 'PENDING'),
    (select count(*)::bigint from story_chunks where created_at >= (select t from since)),
    (select count(*)::bigint from story_chunks
     where extraction_completed_at >= (select t from since)),
    (select count(*)::bigint from stories where merged_at >= (select t from since)),
    (select count(*)::bigint from story_claims where created_at >= (select t from since)),
    (select count(*)::bigint from story_evidence where created_at >= (select t from since)),
    (select count(*)::bigint from claims where created_at >= (select t from since)),
    (select count(*)::bigint from theses where created_at >= (select t from since));
$$;

comment on function public.get_pipeline_progress_24h() is 'Returns pipeline metrics: last 24h counts for ingestion through theses, plus current pending_stories backlog. Use for monitoring and identifying stalled issues.';
