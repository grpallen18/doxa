-- One-time setup: schedule purge of DROP stories older than 30 days.
--
-- Runs on the 1st of each month at 4am UTC. Reduces storage by removing
-- stories we've already decided not to keep.
--
-- Prerequisites: pg_cron enabled (Database → Extensions).
-- Pure SQL—no pg_net, no Vault, no Edge Functions.
--
-- To remove later:
--   select cron.unschedule('purge-drop-stories-monthly');

select cron.schedule(
  'purge-drop-stories-monthly',
  '0 4 1 * *',
  $$ SELECT public.purge_drop_stories(); $$
);
