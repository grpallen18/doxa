-- DEPRECATED: Use cron_clustering_pipeline.sql instead (position-controversy architecture).
-- claim_cluster_nightly is deprecated; claim_clusters table was dropped in migration 050.
--
-- One-time setup: schedule claim_cluster_nightly Edge Function via pg_cron.
-- Two-stage clustering (similarity + contradiction), controversy scoring, cluster labels.
-- Runs every hour (at minute 0). Replaces claim_to_thesis and label_thesis.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key.
-- 3. Deploy claim_cluster_nightly Edge Function.
--
-- BEFORE running this, unschedule the old thesis crons (and old hourly job if upgrading):
--   select cron.unschedule('claim-to-thesis-every-2min');
--   select cron.unschedule('label-thesis-every-10min');
--   select cron.unschedule('claim-cluster-nightly');  -- if upgrading from nightly
--
-- To remove later: select cron.unschedule('claim-cluster-hourly');
--
-- When switching to new pipeline: unschedule this, run cron_clustering_pipeline.sql.

select cron.schedule(
  'claim-cluster-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/claim_cluster_nightly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
