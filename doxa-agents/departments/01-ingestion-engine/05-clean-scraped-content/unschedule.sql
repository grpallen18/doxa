-- Pause clean_scraped_content cron (stops enqueueing graph_processing_jobs).
-- Use when AuraDB is at node caps or graphing should be halted.
-- Safe to run multiple times.
--
-- To re-enable later: run schedule.sql (requires Vault project_url + service_role_key).

do $$ begin perform cron.unschedule('clean-scraped-content-every-5min'); exception when others then null; end $$;
