-- Cleanup: rewrite daily health report off legacy claims/SQL topology tables.
-- Controversies/viewpoints now come from Neo graph_* projections.

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
  story_events_created bigint,
  claims_created bigint,
  events_created bigint,
  awaiting_scrape bigint,
  awaiting_cleaning bigint,
  awaiting_merge bigint,
  unclassified_stories bigint,
  scrape_failed bigint,
  stuck_processing bigint,
  position_relationships_24h bigint,
  positions_24h bigint,
  controversies_24h bigint,
  viewpoints_24h bigint,
  positions_active bigint,
  controversies_active bigint,
  viewpoints_active bigint,
  scrape_total_24h bigint,
  scrape_successes_24h bigint,
  scrape_failures_24h bigint,
  stories_pending_24h bigint
)
language sql stable
security definer
set search_path = public, extensions
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
    0::bigint, -- chunks_created (legacy claims path removed)
    0::bigint, -- chunks_extracted
    0::bigint, -- merges_completed
    0::bigint, -- story_claims_created
    0::bigint, -- story_evidence_created
    0::bigint, -- story_events_created
    0::bigint, -- claims_created
    0::bigint, -- events_created
    (select count(*)::bigint from stories s
     left join story_bodies sb on sb.story_id = s.story_id
     where s.relevance_status = 'KEEP' and s.scrape_skipped = false and sb.story_id is null),
    (select count(*)::bigint from story_bodies where cleaned_at is null),
    0::bigint, -- awaiting_merge
    (select count(*)::bigint from stories where relevance_status is null),
    (select count(*)::bigint from stories where scrape_skipped = true and scrape_skipped_at >= (select t from since)),
    (select count(*)::bigint from stories where being_processed = true),
    0::bigint, -- position_relationships_24h
    (select count(*)::bigint from graph_viewpoints where updated_at >= (select t from since)),
    (select count(*)::bigint from graph_controversies where updated_at >= (select t from since)),
    (select count(*)::bigint from graph_viewpoints where updated_at >= (select t from since)),
    (select count(*)::bigint from graph_viewpoints),
    (select count(*)::bigint from graph_controversies),
    (select count(*)::bigint from graph_viewpoints),
    (select count(*)::bigint from stories where scraped_at >= (select t from since) or scrape_skipped_at >= (select t from since)),
    (select count(*)::bigint from stories where scraped_at >= (select t from since)),
    (select count(*)::bigint from stories where scrape_skipped = true and scrape_skipped_at >= (select t from since)),
    (select count(*)::bigint from stories
     where relevance_ran_at >= (select t from since) and relevance_status = 'PENDING');
$$;

comment on function public.get_daily_health_report() is
  'Daily ops metrics for Discord/admin. Neo graph_* for debate; legacy claims metrics zeroed after Cleanup.';
