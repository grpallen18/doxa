-- One-time setup: schedule periodic cleanup of log/support tables to keep DB size low.
--
-- Keeps cron.job_run_details and net._http_response small. These tables grow quickly
-- and aren't needed for core functionality. Free plan has 500MB limit.
--
-- Retention:
--   cron.job_run_details: 2 days (for recent debugging)
--   net._http_response: 1 hour (responses not needed after Edge Function calls complete)
--
-- Prerequisites: pg_cron enabled (Database → Extensions).
-- These jobs run pure SQL—no pg_net, no Vault, no Edge Functions.
--
-- To remove later:
--   select cron.unschedule('cleanup-cron-job-run-details-daily');
--   select cron.unschedule('cleanup-http-responses-hourly');

-- 1. Clean cron job history: daily at 4:30am UTC, delete records older than 2 days
select cron.schedule(
  'cleanup-cron-job-run-details-daily',
  '30 4 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'; $$
);

-- 2. Clean pg_net HTTP responses: every hour, delete records older than 1 hour
select cron.schedule(
  'cleanup-http-responses-hourly',
  '0 * * * *',
  $$ DELETE FROM net._http_response WHERE created < now() - interval '1 hour'; $$
);
