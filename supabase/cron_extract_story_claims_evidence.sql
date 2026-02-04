-- One-time setup: schedule extract_story_claims_evidence to run after relevance_gate (11:06, 11:08, ... 11:30 UTC).
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as relevance_gate).
-- 3. Run after 015_stories_extraction_status_fields.sql.
--
-- To remove later: select cron.unschedule('extract-story-claims-evidence-11-06-to-11-30-utc');

select cron.schedule(
  'extract-story-claims-evidence-11-06-to-11-30-utc',
  '6,8,10,12,14,16,18,20,22,24,26,28,30 11 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/extract_story_claims_evidence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
