-- Curator worker every 20 minutes. Run after deploying run_l3_curator.

do $$ begin perform cron.unschedule('l3-curator-every-20min'); exception when others then null; end $$;

select cron.schedule(
  'l3-curator-every-20min',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/run_l3_curator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 5}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
