-- One-time setup: schedule relevance_gate to run at 11:05 AM UTC, then every 2 minutes until 11:30 AM UTC (11:05, 11:07, 11:09, ... 11:29).
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Create Vault secrets (Dashboard → SQL Editor or Database → Vault):
--      select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--    Use your project URL and Edge Functions service role key (Dashboard → Settings → API).
--
-- Then run this script once. To remove the schedule later:
--   select cron.unschedule('relevance-gate-11-05-to-11-30-utc');

select cron.schedule(
  'relevance-gate-11-05-to-11-30-utc',
  '5,7,9,11,13,15,17,19,21,23,25,27,29 11 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/relevance_gate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
