-- Topology pipeline crons (debate-topology workflow).
-- Prerequisites: pg_cron, pg_net, vault secrets project_url + service_role_key.
-- Run seed_subtopic_embeddings once before assign_ranked_subtopics.

do $$ begin perform cron.unschedule('refresh-claim-eligibility-daily'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('classify-position-pairs-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('clustering-upsert-periodic'); exception when others then null; end $$;

-- Refresh topology candidates daily at 3am UTC
select cron.schedule(
  'refresh-topology-candidates-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refresh_topology_candidates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Link canonical positions every 2 minutes
select cron.schedule(
  'link-canonical-positions-every-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/link_canonical_positions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Generate position pair candidates every 10 minutes
select cron.schedule(
  'generate-position-pair-candidates-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate_position_pair_candidates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Classify position relationships every 15 minutes
select cron.schedule(
  'classify-position-relationships-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/classify_position_relationships',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Topology pipeline (1st and 15th, 2am UTC)
select cron.schedule(
  'topology-pipeline-periodic',
  '0 2 1,15 * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/topology_pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"skip_summaries_viewpoints": true}'::jsonb
  ) as request_id;
  $$
);

-- Agreement summaries every 6 hours
select cron.schedule(
  'generate-agreement-summaries-every-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate_agreement_summaries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Viewpoints every 6 hours at :30
select cron.schedule(
  'generate-viewpoints-every-6h',
  '30 */6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate_viewpoints',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Orphan cleanup weekly
select cron.schedule(
  'orphan-cleanup-weekly',
  '0 4 * * 0',
  $$ select public.run_orphan_cleanup(); $$
);
