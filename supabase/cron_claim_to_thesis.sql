-- One-time setup: schedule claim_to_thesis via pg_cron.
-- Clusters claims into theses by embedding similarity (5 claims per run). Every 2 minutes.
-- Runs inside the DB (no HTTP). Prerequisites: pg_cron enabled.
--
-- To remove later: select cron.unschedule('claim-to-thesis-every-2min');

select cron.schedule(
  'claim-to-thesis-every-2min',
  '*/5 * * * *',
  $$ select public.claim_to_thesis_run(5); $$
);
