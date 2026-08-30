-- DISABLED: Grok Editor runs on xAI schedule via MCP (submit_viewpoint_proposal).
-- Edge function run_l3_editor remains for manual invoke / debugging only.
-- Safe to run multiple times.

do $$ begin perform cron.unschedule('l3-editor-hourly'); exception when others then null; end $$;
