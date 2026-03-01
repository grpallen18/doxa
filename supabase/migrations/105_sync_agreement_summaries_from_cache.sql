-- RPC: sync_agreement_summaries_from_cache
-- Bulk-updates agreement_clusters from agreement_summary_cache where cache exists and label/summary is missing.
-- No LLM. Called by generate_agreement_summaries in parallel with LLM path.

set search_path = public, extensions;

create or replace function public.sync_agreement_summaries_from_cache(p_max_count int default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  synced_count int;
begin
  with to_sync as (
    select ac.agreement_cluster_id, ac.membership_fingerprint
    from public.agreement_clusters ac
    join public.agreement_summary_cache c on ac.membership_fingerprint = c.membership_fingerprint
    where ac.status = 'active'
      and ac.membership_fingerprint is not null
      and (ac.label is null or ac.summary is null)
    limit p_max_count
  )
  update public.agreement_clusters ac
  set label = c.label, summary = c.summary
  from to_sync t
  join public.agreement_summary_cache c on c.membership_fingerprint = t.membership_fingerprint
  where ac.agreement_cluster_id = t.agreement_cluster_id;

  get diagnostics synced_count = row_count;

  return jsonb_build_object('synced_count', synced_count);
end;
$$;

comment on function public.sync_agreement_summaries_from_cache(int) is 'Bulk-updates agreement_clusters from cache where label/summary missing. No LLM. Used by generate_agreement_summaries sync mode.';
