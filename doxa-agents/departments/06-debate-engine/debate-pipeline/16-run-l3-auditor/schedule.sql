-- Auditor worker hourly. Run after deploying run_l3_auditor.

do $$ begin perform cron.unschedule('l3-auditor-hourly'); exception when others then null; end $$;

select cron.schedule(
  'l3-auditor-hourly',
  '45 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/run_l3_auditor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 8}'::jsonb,
    timeout_milliseconds := 180000
  ) as request_id;
  $$
);
