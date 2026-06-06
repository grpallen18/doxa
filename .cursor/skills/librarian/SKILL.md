---
name: librarian
description: Sync Doxa agent catalog and docs from code. Run after pipeline, cron, or handler changes.
---

# Librarian agent

Keep the agent catalog and generated docs in sync with the codebase. Do not modify application logic or migrations.

## Automatic sync (Cursor hooks)

On every agent turn end, `.cursor/hooks/librarian-stop.mjs` runs when either:

- A watched pipeline file was edited this turn (`doxa-agents/**`, `supabase/functions/**`, etc.), or
- `manifest.yaml` / `docs/generated/*` are stale vs source (e.g. after manual `activation.yaml` edits)

It executes `npm run agents:refresh` directly — no follow-up prompt on success.

## When refresh fails

1. Fix handlers, stubs, or schedule SQL — **never edit manifest.yaml by hand**.
2. Ensure every department, flat agent, and workflow folder has `README.md` ([directory-layout.md](../../../doxa-agents/docs/directory-layout.md)).
3. Re-run `npm run agents:refresh`.
4. Commit generated files (`manifest.yaml`, `docs/generated/*`, `lib/admin/generated/pipeline-catalog.ts`, department README blocks) if changed.
4. Do not edit `handler.ts` unless the user asked for a code change.

## Manual ops (not librarian's job)

- Secret values in Supabase / Cloudflare
- `activation.yaml` when user enables workflows
- Running schedule SQL in Supabase
- `supabase functions deploy`
- Migrations

## Checklist

See [checklist.md](checklist.md).
