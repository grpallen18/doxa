-- One-time setup: schedule merge_story_entities via pg_cron.
-- Merges chunk extractions into story_claims, story_evidence, story_positions, story_events, and bridge tables. Every 2 minutes.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as other pipeline crons).
--
-- Legacy jobs (unschedule if upgrading): merge-story-claims-every-2min, merge-story-entities-every-2min (old URL)
-- To remove later: select cron.unschedule('merge-story-entities-every-2min');

select cron.schedule(
  'merge-story-entities-every-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/merge_story_entities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
