-- Current-inventory story pipeline Sankey for Observability.
-- Unclassified relevance_status is grouped with PENDING (same as story gating).
-- KEEP vs DROP after pending review uses pending_review_ran_at.
-- Scrape-failure KEEP stories flow to Drop (left the scrape path).

create or replace function public.get_story_pipeline_sankey_counts()
returns table (
  ingested bigint,
  drop_direct bigint,
  pending_current bigint,
  pending_to_drop bigint,
  pending_to_keep bigint,
  keep_direct bigint,
  keep_awaiting_scrape bigint,
  keep_scrape_failure bigint,
  keep_scrape_success bigint,
  scrape_awaiting_clean bigint,
  scrape_cleaned bigint,
  cleaned_graph_queued bigint,
  cleaned_graphed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with classified as (
    select
      coalesce(st.relevance_status, 'PENDING') as status,
      (st.pending_review_ran_at is not null) as via_pending,
      coalesce(st.scrape_skipped, false) as scrape_skipped,
      (st.scraped_at is not null or sb.story_id is not null) as scraped,
      (
        sb.cleaned_at is not null
        or nullif(btrim(coalesce(sb.content_clean, '')), '') is not null
      ) as cleaned,
      st.graph_status
    from public.stories st
    left join public.story_bodies sb on sb.story_id = st.story_id
  )
  select
    count(*)::bigint as ingested,
    count(*) filter (
      where status = 'DROP' and not via_pending and not scrape_skipped
    )::bigint as drop_direct,
    count(*) filter (where status = 'PENDING')::bigint as pending_current,
    count(*) filter (
      where status = 'DROP' and (via_pending or scrape_skipped)
    )::bigint as pending_to_drop,
    count(*) filter (
      where status = 'KEEP' and via_pending
    )::bigint as pending_to_keep,
    count(*) filter (
      where status = 'KEEP' and not via_pending
    )::bigint as keep_direct,
    count(*) filter (
      where status = 'KEEP' and not scrape_skipped and not scraped
    )::bigint as keep_awaiting_scrape,
    count(*) filter (
      where status = 'KEEP' and scrape_skipped
    )::bigint as keep_scrape_failure,
    count(*) filter (
      where status = 'KEEP' and not scrape_skipped and scraped
    )::bigint as keep_scrape_success,
    count(*) filter (
      where status = 'KEEP' and not scrape_skipped and scraped and not cleaned
    )::bigint as scrape_awaiting_clean,
    count(*) filter (
      where status = 'KEEP' and not scrape_skipped and scraped and cleaned
    )::bigint as scrape_cleaned,
    count(*) filter (
      where status = 'KEEP'
        and not scrape_skipped
        and scraped
        and cleaned
        and graph_status is distinct from 'succeeded'
    )::bigint as cleaned_graph_queued,
    count(*) filter (
      where status = 'KEEP'
        and not scrape_skipped
        and scraped
        and cleaned
        and graph_status = 'succeeded'
    )::bigint as cleaned_graphed
  from classified;
$$;

comment on function public.get_story_pipeline_sankey_counts() is
  'Current story inventory for the Observability Sankey: ingest → keep/drop/pending → scrape → clean → graph.';

grant execute on function public.get_story_pipeline_sankey_counts() to service_role;
