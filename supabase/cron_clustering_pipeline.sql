-- One-time setup: split clustering into refresh (no LLM), classification (LLM), and incremental upsert.
-- 1. refresh_claim_eligibility: daily at 3am UTC (500 claims/run, vector search only; resets 14-day timer or flags needs_cluster_update).
-- 2. classify_claim_pairs: every 15 min (25 claims/run, LLM; processes new or flagged claims).
-- 3. clustering_pipeline (skip_classify, skip_summaries_viewpoints): 1st and 15th of each month at 2am (incremental upsert of positions and controversies; summaries/viewpoints on separate crons).
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key.
-- 3. Deploy: refresh_claim_eligibility, classify_claim_pairs, build_position_clusters, aggregate_position_pair_scores,
--    build_controversy_clusters, generate_position_summaries, generate_viewpoints, clustering_pipeline.
--
-- BEFORE running: Check Database → Cron Jobs in Supabase Dashboard for any deprecated jobs.
-- Step 1 (below) unschedules old/deprecated crons. Step 2–7 schedule the new pipeline.
--
-- Note: Summaries/viewpoints split to separate crons to clear backlog; reassess merging back into pipeline once caught up.
--
-- To remove later:
--   select cron.unschedule('refresh-claim-eligibility-daily');
--   select cron.unschedule('classify-claim-pairs-every-15min');
--   select cron.unschedule('clustering-upsert-periodic');
--   select cron.unschedule('generate-position-summaries-every-6h');
--   select cron.unschedule('generate-viewpoints-every-6h');
--   select cron.unschedule('orphan-cleanup-weekly');

-- 1. Remove old/deprecated crons (no-op if already deleted)
do $$ begin perform cron.unschedule('clustering-pipeline-every-30min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('refresh-claim-eligibility-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-cluster-hourly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-cluster-nightly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-to-thesis-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('label-thesis-every-10min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('clustering-rebuild-periodic'); exception when others then null; end $$;

-- 2. Refresh claim eligibility daily at 3am UTC (no LLM; 500 claims/run)
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

-- 3. Classify claim pairs every 15 minutes (LLM; 25 claims/run)
select cron.schedule(
  'classify-claim-pairs-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/classify_claim_pairs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 4. Incremental upsert of positions and controversies (1st and 15th, 2am UTC). Summaries/viewpoints run on separate crons.
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
    body := '{"skip_classify": true, "skip_summaries_viewpoints": true}'::jsonb
  ) as request_id;
  $$
);

-- 5. Generate position summaries every 6 hours at :00 UTC (0, 6, 12, 18)
select cron.schedule(
  'generate-position-summaries-every-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate_position_summaries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 6. Generate viewpoints every 6 hours at :30 UTC (0:30, 6:30, 12:30, 18:30). Offset so summaries complete first.
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

-- 7. Orphan cleanup: delete inactive positions/controversies (7+ days), purge lineage (30+ days). Weekly Sunday 4am UTC.
select cron.schedule(
  'orphan-cleanup-weekly',
  '0 4 * * 0',
  $$ select public.run_orphan_cleanup(); $$
);
