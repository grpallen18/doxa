-- Position-first clustering pipeline crons.
-- Run this in Supabase SQL Editor after migrations and function deployment.
--
-- Prerequisites: pg_cron, pg_net enabled; vault secrets project_url, service_role_key.
-- Run seed_subtopic_embeddings (run_seed_subtopic_embeddings.sql) first.
--
-- BEFORE running: Check Database → Cron Jobs in Supabase Dashboard for any deprecated jobs.

-- 1. Remove old/deprecated crons (no-op if already deleted)
do $$ begin perform cron.unschedule('clustering-pipeline-every-30min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('refresh-claim-eligibility-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-cluster-hourly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-cluster-nightly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-to-thesis-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('label-thesis-every-10min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('clustering-rebuild-periodic'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('classify-claim-pairs-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-position-summaries-every-6h'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('link-canonical-positions-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('classify-position-pairs-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('clustering-upsert-periodic'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-agreement-summaries-every-6h'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-viewpoints-every-6h'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('orphan-cleanup-weekly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('refresh-claim-eligibility-daily'); exception when others then null; end $$;

-- 2. Refresh claim eligibility daily at 3am UTC (optional; for claim layer)
select cron.schedule(
  'refresh-claim-eligibility-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refresh_claim_eligibility',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 3. Link canonical positions every 2 minutes
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

-- 4. Classify position pairs every 15 minutes (LLM)
select cron.schedule(
  'classify-position-pairs-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/classify_position_pairs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 5. Clustering pipeline (1st and 15th, 2am UTC). Summaries/viewpoints on separate crons.
select cron.schedule(
  'clustering-upsert-periodic',
  '0 2 1,15 * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/clustering_pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"skip_summaries_viewpoints": true}'::jsonb
  ) as request_id;
  $$
);

-- 6. Generate agreement summaries every 6 hours at :00 UTC (0, 6, 12, 18)
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

-- 7. Generate viewpoints every 6 hours at :30 UTC (0:30, 6:30, 12:30, 18:30). Offset so summaries complete first.
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

-- 8. Orphan cleanup: delete inactive agreements/controversies (7+ days), purge lineage (30+ days). Weekly Sunday 4am UTC.
select cron.schedule(
  'orphan-cleanup-weekly',
  '0 4 * * 0',
  $$ select public.run_orphan_cleanup(); $$
);
