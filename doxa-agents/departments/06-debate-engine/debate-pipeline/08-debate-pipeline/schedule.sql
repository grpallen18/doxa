-- Registry-first debate_pipeline hourly.
-- Run in Supabase SQL Editor after deploying debate_pipeline.

do $$ begin perform cron.unschedule('debate-pipeline-hourly'); exception when others then null; end $$;

select cron.schedule(
  'debate-pipeline-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/debate_pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 500, "skip_llm": true}'::jsonb,
    timeout_milliseconds := 600000
  ) as request_id;
  $$
);
