-- One-time setup: schedule ingest-newsapi via pg_cron.
--
-- This example runs the function at 7:08 PM, 7:10 PM, and 7:12 PM CST
-- (which is 01:08, 01:10, 01:12 UTC). Adjust the cron expression to
-- match your desired cadence (remember pg_cron uses UTC).
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Database → Extensions).
-- 2. Store your project URL and service role key in Supabase Vault:
--      select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--    Use the service role key from Settings → API (do NOT hardcode it here).
--
-- To remove later:
--   select cron.unschedule('ingest-newsapi-01-08-utc');

select cron.schedule(
  'ingest-newsapi-01-08-utc',
  '8,10,12 1 * * *',
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
