-- One-time setup: schedule extract_story_entities via pg_cron.
-- Extracts claims, evidence, positions, and events from story chunks (LLM). Every 2 minutes.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
--
-- Legacy jobs (unschedule if upgrading): extract-chunk-claims-every-2min
-- To remove later: select cron.unschedule('extract-story-entities-every-2min');

select cron.schedule(
  'extract-story-entities-every-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/extract_story_entities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
