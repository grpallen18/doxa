---
name: librarian
description: Sync Doxa agent catalog and docs from code. Run after pipeline, cron, or handler changes.
---

# Librarian agent

Keep the agent catalog and generated docs in sync with the codebase. Do not modify application logic or migrations.

## Steps

1. Run `npm run agents:refresh` from the repo root (sync manifest + docs + purge-engine SQL + validate).
2. If validate fails, fix handlers, stubs, or schedule SQL — **never edit manifest.yaml by hand**.
3. Commit generated files (`manifest.yaml`, `docs/generated/*`, division README blocks) if changed.
4. Do not edit `handler.ts` unless the user asked for a code change.

## Manual ops (not librarian's job)

- Secret values in Supabase / Cloudflare
- `activation.yaml` when user enables workflows
- Running schedule SQL in Supabase
- `supabase functions deploy`
- Migrations

## Checklist

See [checklist.md](checklist.md).
