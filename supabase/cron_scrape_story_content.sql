-- One-time setup: schedule scrape_story_content to populate story_bodies for KEEP stories.
-- Sets scrape_skipped when a story cannot be scraped (no URL or scrape failed). No LLM.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key (same as relevance_gate).
--
-- To remove later: select cron.unschedule('scrape-story-content-11-05-utc');

select cron.schedule(
  'scrape-story-content-11-05-utc',
  '5 11 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scrape_story_content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
