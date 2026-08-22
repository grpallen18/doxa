-- Unschedule inactive legacy pg_cron jobs (claims, positions, clustering, topology).
-- Keeps active: ingest-newsapi-daily, scrape-story-content, clean-scraped-content,
-- relevance-gate, review-pending-stories, debate-pipeline-hourly.

do $$ begin perform cron.unschedule('chunk-story-bodies-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('classify-position-relationships-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('cleanup-cron-job-run-details-daily'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('cleanup-http-responses-hourly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('discord-daily-health-report'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('extract-story-entities-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-agreement-summaries-every-6h'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-position-pair-candidates-every-10min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generate-viewpoints-every-6h'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('link-canonical-claims-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('link-canonical-events-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('link-canonical-positions-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('merge-story-entities-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('orphan-cleanup-weekly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('purge-drop-stories-monthly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('refresh-topology-candidates-daily'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('topology-pipeline-periodic'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('update-stance-every-20min'); exception when others then null; end $$;
-- Historical pair-first debate cron (handler removed)
do $$ begin perform cron.unschedule('classify-proposition-relationships-every-10min'); exception when others then null; end $$;
