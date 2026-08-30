-- DISABLED: Grok Curator runs on xAI schedule via MCP (claim_review_batch).
-- Edge function run_l3_curator remains for manual invoke / debugging only.
-- Safe to run multiple times.

do $$ begin perform cron.unschedule('l3-curator-every-20min'); exception when others then null; end $$;
