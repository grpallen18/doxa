-- Counter-side recall every 2 hours. Run after deploying sweep_counter_side.

do $$ begin perform cron.unschedule('l3-sweep-counter-side'); exception when others then null; end $$;

select cron.schedule(
  'l3-sweep-counter-side',
  '50 */2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sweep_counter_side',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"limit": 20}'::jsonb,
    timeout_milliseconds := 180000
  ) as request_id;
  $$
);
