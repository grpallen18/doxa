-- One-time setup: schedule thesis_drift_relabel via pg_cron.
-- Writes/rewrites thesis text for theses with biggest centroid-vs-text drift. Every 10 minutes.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
--
-- To remove later: select cron.unschedule('thesis-drift-relabel-every-10min');

select cron.schedule(
  'thesis-drift-relabel-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/thesis_drift_relabel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
