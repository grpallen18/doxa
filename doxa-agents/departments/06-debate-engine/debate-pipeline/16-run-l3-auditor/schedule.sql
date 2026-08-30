-- DISABLED: Grok Auditor runs on xAI schedule via MCP (list_audit_ready_controversies / submit_audit_verdict).
-- Edge function run_l3_auditor remains for manual invoke / debugging only.
-- Safe to run multiple times.

do $$ begin perform cron.unschedule('l3-auditor-hourly'); exception when others then null; end $$;
