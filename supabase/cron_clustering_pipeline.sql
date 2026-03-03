-- Position-first clustering pipeline crons.
-- 1. refresh_claim_eligibility: daily at 3am UTC (optional; for claim layer).
-- 2. link_canonical_positions: every 2 min (links story_positions to canonical).
-- 3. classify_position_pairs: every 15 min (LLM; position pair classification).
-- 4. clustering_pipeline (skip_summaries_viewpoints): 1st and 15th at 2am (build_debate_topology only; link/assign/classify run on own crons).
-- 5. generate_agreement_summaries: every 6h.
-- 6. generate_viewpoints: every 6h.
--
-- Prerequisites:
-- 1. Enable pg_cron and pg_net. 2. Vault secrets project_url, service_role_key.
-- 3. Run seed_subtopic_embeddings once before assign_ranked_subtopics.
-- 4. Deploy: link_canonical_positions, assign_ranked_subtopics, classify_position_pairs, build_debate_topology,
--    generate_agreement_summaries, generate_viewpoints, clustering_pipeline.
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
do $$ begin perform cron.unschedule('classify-claim-pairs-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-position-summaries-every-6h'); exception when others then null; end $$;

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
