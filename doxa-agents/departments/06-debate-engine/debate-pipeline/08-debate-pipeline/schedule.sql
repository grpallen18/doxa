-- L3 overhaul Session 5: debate_pipeline hourly (Question-first six-step chain).
-- Run in Supabase SQL Editor after deploying debate_pipeline.
--
-- Job: debate-pipeline-hourly — 15 * * * * → debate_pipeline { limit: 15, skip_llm: true, also_rematch: true }
-- Note: Edge orchestrator wall clock (~150s) caps total chain runtime; keep limit modest.
-- also_rematch: normal mint first, then coalesce rematch_singletons pass.

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
    body := '{"limit": 15, "skip_llm": true, "also_rematch": true}'::jsonb,
    timeout_milliseconds := 600000
  ) as request_id;
  $$
);
