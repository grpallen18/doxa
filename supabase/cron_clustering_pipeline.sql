-- One-time setup: split clustering into refresh (no LLM), classification (LLM), and periodic rebuild.
-- 1. refresh_claim_eligibility: daily at 3am UTC (500 claims/run, vector search only; resets 14-day timer or flags needs_cluster_update).
-- 2. classify_claim_pairs: every 15 min (25 claims/run, LLM; processes new or flagged claims).
-- 3. clustering_pipeline (skip_classify): 1st and 15th of each month at 2am (rebuilds positions, controversies, viewpoints).
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net (Dashboard → Database → Extensions).
-- 2. Vault secrets project_url and service_role_key.
-- 3. Deploy: refresh_claim_eligibility, classify_claim_pairs, build_position_clusters, aggregate_position_pair_scores,
--    build_controversy_clusters, generate_position_summaries, generate_viewpoints, clustering_pipeline.
--
-- BEFORE running this, delete the old cron in Supabase Dashboard (Database → Cron Jobs)
-- or run: select cron.unschedule('clustering-pipeline-every-30min');
-- (If already removed, comment out the unschedule line below to avoid errors.)
--
-- To remove later:
--   select cron.unschedule('refresh-claim-eligibility-daily');
--   select cron.unschedule('classify-claim-pairs-every-15min');
--   select cron.unschedule('clustering-rebuild-periodic');

-- 1. Remove old crons (no-op if already deleted)
do $$ begin perform cron.unschedule('clustering-pipeline-every-30min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('refresh-claim-eligibility-every-15min'); exception when others then null; end $$;

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

-- 4. Rebuild positions, controversies, viewpoints (1st and 15th of each month at 2am UTC)
select cron.schedule(
  'clustering-rebuild-periodic',
  '0 2 1,15 * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/clustering_pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"skip_classify": true}'::jsonb
  ) as request_id;
  $$
);
