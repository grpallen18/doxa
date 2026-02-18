-- RPC: sync_position_summaries_from_cache
-- Bulk-updates position_clusters from position_summary_cache where cache exists and label/summary is missing.
-- No LLM. Called by generate_position_summaries in parallel with LLM path.

create or replace function public.sync_position_summaries_from_cache(p_max_count int default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  synced_count int;
begin
  with to_sync as (
    select pc.position_cluster_id, pc.membership_fingerprint
    from public.position_clusters pc
    join public.position_summary_cache c on pc.membership_fingerprint = c.membership_fingerprint
    where pc.status = 'active'
      and pc.membership_fingerprint is not null
      and (pc.label is null or pc.summary is null)
    limit p_max_count
  )
  update public.position_clusters pc
  set label = c.label, summary = c.summary
  from to_sync t
  join public.position_summary_cache c on c.membership_fingerprint = t.membership_fingerprint
  where pc.position_cluster_id = t.position_cluster_id;

  get diagnostics synced_count = row_count;

  return jsonb_build_object('synced_count', synced_count);
end;
$$;

comment on function public.sync_position_summaries_from_cache(int) is 'Bulk-updates position_clusters from cache where label/summary missing. No LLM. Used by generate_position_summaries sync mode.';
