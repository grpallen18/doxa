-- One-time setup: schedule ingest-newsapi via pg_cron.
--
-- Runs at 6 AM and 6 PM CST (12:00 and 00:00 UTC). pg_cron uses UTC.
-- To change schedule: unschedule the job below, then run this script with a new expression.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Database → Extensions).
-- 2. Store your project URL and service role key in Supabase Vault:
--      select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--    Use the service role key from Settings → API (do NOT hardcode it here).
--
-- To remove later:
--   select cron.unschedule('ingest-newsapi-6am-6pm-cst');

select cron.schedule(
  'ingest-newsapi-6am-6pm-cst',
  '0 0,12 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ingest-newsapi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
