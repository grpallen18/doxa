-- Editor worker hourly. Run after deploying run_l3_editor.

do $$ begin perform cron.unschedule('l3-editor-hourly'); exception when others then null; end $$;

select cron.schedule(
  'l3-editor-hourly',
  '35 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/run_l3_editor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 8}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
