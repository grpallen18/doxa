-- One-time cleanup: unschedule deprecated clustering crons.
-- Run this in SQL Editor if you have old crons still running.
-- Safe to run multiple times (no-op if job doesn't exist).

do $$ begin perform cron.unschedule('clustering-pipeline-every-30min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('refresh-claim-eligibility-every-15min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-cluster-hourly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-cluster-nightly'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('claim-to-thesis-every-2min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('label-thesis-every-10min'); exception when others then null; end $$;
