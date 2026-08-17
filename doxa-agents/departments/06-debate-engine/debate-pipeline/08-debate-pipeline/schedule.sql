-- Schedule debate_pipeline via pg_cron (hourly at :15).
-- Cross-document Neo debate assembly over Proposition/Argument backlog.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
-- 3. Debate Edge Functions deployed with --no-verify-jwt + NEO4J_* / OPENAI_API_KEY secrets.
-- 4. Also schedule classify-proposition-relationships-every-10min
--    (02-classify-proposition-relationships/schedule.sql).
--
-- Body uses limit:50 so candidate gen + classify stay under Edge ~150s idle timeout.
-- pg_net default wait is 5s — debate_pipeline needs timeout_milliseconds := 150000.
-- First cutover after Arena/CQ deploy: invoke once with {"force_full":true,"limit":50}.
--
-- To remove later: select cron.unschedule('debate-pipeline-hourly');

select cron.schedule(
  'debate-pipeline-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/debate_pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 50}'::jsonb,
    timeout_milliseconds := 150000
  ) as request_id;
  $$
);