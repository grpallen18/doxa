-- One-time setup: schedule relevance_gate via pg_cron.
--
-- Every 2 minutes (CST/UTC agnostic). To change: unschedule, then run with new expression.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Create Vault secrets (Dashboard → SQL Editor or Database → Vault):
--      select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--    Use your project URL and Edge Functions service role key (Dashboard → Settings → API).
--
-- To remove later:
--   select cron.unschedule('relevance-gate-every-2min');

select cron.schedule(
  'relevance-gate-every-2min',
  '*/2 * * * *',
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
