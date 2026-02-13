-- One-time setup: schedule label_thesis via pg_cron.
-- Writes/rewrites thesis text for theses with biggest centroid-vs-text drift. Every 10 minutes.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
--
-- If you previously had thesis_drift_relabel scheduled, unschedule it first:
--   select cron.unschedule('thesis-drift-relabel-every-10min');
--
-- To remove later: select cron.unschedule('label-thesis-every-10min');

select cron.schedule(
  'label-thesis-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/label_thesis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
