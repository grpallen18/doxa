-- One-time setup: schedule discord_daily_health via pg_cron.
--
-- Runs at noon CST (18:00 UTC). pg_cron uses UTC.
-- To change schedule: unschedule the job below, then run this script with a new expression.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Database → Extensions).
-- 2. Store your project URL and service role key in Supabase Vault:
--      select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
-- 3. Set DISCORD_WEBHOOK in Supabase Edge Function secrets (Dashboard or supabase secrets set).
--
-- To remove later:
--   select cron.unschedule('discord-daily-health-report');

select cron.schedule(
  'discord-daily-health-report',
  '0 18 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/discord_daily_health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
