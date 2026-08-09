-- Schedule classify_proposition_relationships via pg_cron (every 10 minutes).
-- Drains pending pair-candidate Decisions between hourly debate_pipeline runs.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key.
-- 3. Edge Function deployed with --no-verify-jwt + NEO4J_* / OPENAI_API_KEY.
--
-- Body limit:40 stays under Edge ~150s idle timeout for gpt-4o-mini classify.
--
-- To remove later: select cron.unschedule('classify-proposition-relationships-every-10min');

select cron.schedule(
  'classify-proposition-relationships-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/classify_proposition_relationships',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 40}'::jsonb
  ) as request_id;
  $$
);
