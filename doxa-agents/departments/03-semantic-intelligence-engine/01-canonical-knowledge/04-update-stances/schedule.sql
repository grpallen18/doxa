-- One-time setup: schedule update_stances via pg_cron.
-- Backfills stance on story_claims with null stance. Every 20 minutes.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
--
-- To remove later: select cron.unschedule('update-stance-every-20min');

select cron.schedule(
  'update-stance-every-20min',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/update_stances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
