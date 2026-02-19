-- Add stories_approved and stories_dropped to get_daily_health_report (split from stories_reviewed).
-- Must drop first because return type changes (PostgreSQL does not allow CREATE OR REPLACE for that).

drop function if exists public.get_daily_health_report();

create or replace function public.get_daily_health_report()
returns table (
  stories_ingested bigint,
  stories_approved bigint,
  stories_dropped bigint,
  stories_scraped bigint,
  stories_cleaned bigint,
  pending_stories_count bigint,
  chunks_created bigint,
  chunks_extracted bigint,
  merges_completed bigint,
  story_claims_created bigint,
  story_evidence_created bigint,
  claims_created bigint,
  awaiting_scrape bigint,
  awaiting_cleaning bigint,
  awaiting_merge bigint,
  unclassified_stories bigint,
  scrape_failed bigint,
  stuck_processing bigint,
  claim_relationships_24h bigint,
  positions_24h bigint,
  controversies_24h bigint,
  viewpoints_24h bigint,
  positions_active bigint,
  controversies_active bigint,
  viewpoints_active bigint
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
     where relevance_ran_at >= (select t from since) and relevance_status = 'KEEP'),
    (select count(*)::bigint from stories
     where relevance_ran_at >= (select t from since) and relevance_status = 'DROP'),
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
    (select count(*)::bigint from stories s
     left join story_bodies sb on sb.story_id = s.story_id
     where s.relevance_status = 'KEEP' and sb.story_id is null),
    (select count(*)::bigint from story_bodies where cleaned_at is null),
    (select count(*)::bigint from stories s
     where s.merged_at is null
     and exists (select 1 from story_chunks sc where sc.story_id = s.story_id)
     and not exists (select 1 from story_chunks sc where sc.story_id = s.story_id and sc.extraction_json is null)
     and not exists (select 1 from story_claims sc where sc.story_id = s.story_id)),
    (select count(*)::bigint from stories where relevance_status is null),
    (select count(*)::bigint from stories where scrape_skipped = true),
    (select count(*)::bigint from stories where being_processed = true),
    (select count(*)::bigint from claim_relationships where classified_at >= (select t from since)),
    (select count(*)::bigint from position_clusters where created_at >= (select t from since)),
    (select count(*)::bigint from controversy_clusters where created_at >= (select t from since)),
    (select count(*)::bigint from controversy_viewpoints where created_at >= (select t from since)),
    (select count(*)::bigint from position_clusters where status = 'active'),
    (select count(*)::bigint from controversy_clusters where status = 'active'),
    (select count(*)::bigint from controversy_viewpoints cv
     join controversy_clusters cc on cv.controversy_cluster_id = cc.controversy_cluster_id
     where cc.status = 'active');
$$;
