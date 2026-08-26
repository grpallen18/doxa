-- One-time setup: schedule clean_scraped_content via pg_cron.
-- Cleans raw article text with LLM (removes site chrome). Every 5 minutes.
-- Also enqueues graph_processing_jobs for the Neo4j graph-worker — do not
-- re-run while AuraDB is at free-tier node caps (use unschedule.sql to pause).
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
--
-- To remove: run unschedule.sql (or select cron.unschedule('clean-scraped-content-every-5min');)

select cron.schedule(
  'clean-scraped-content-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/clean_scraped_content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
