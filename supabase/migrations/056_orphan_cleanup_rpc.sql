-- RPC: run_orphan_cleanup
-- Deletes inactive positions/controversies older than 7 days; purges lineage older than 30 days.
-- Called by orphan-cleanup-weekly cron.

create or replace function public.run_orphan_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  positions_deleted int;
  controversies_deleted int;
  lineage_deleted int;
  cutoff_7d timestamptz := now() - interval '7 days';
  cutoff_30d timestamptz := now() - interval '30 days';
begin
  delete from public.position_clusters
  where status = 'inactive' and deactivated_at < cutoff_7d;
  get diagnostics positions_deleted = row_count;

  delete from public.controversy_clusters
  where status = 'inactive' and deactivated_at < cutoff_7d;
  get diagnostics controversies_deleted = row_count;

  delete from public.position_cluster_migrations
  where created_at < cutoff_30d;
  get diagnostics lineage_deleted = row_count;

  return jsonb_build_object(
    'positions_deleted', positions_deleted,
    'controversies_deleted', controversies_deleted,
    'lineage_deleted', lineage_deleted
  );
end;
$$;

comment on function public.run_orphan_cleanup() is 'Deletes inactive positions/controversies older than 7 days; purges lineage older than 30 days. Weekly cron.';
