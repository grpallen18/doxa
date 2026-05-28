# Doxa Agents

Pipeline agents for ingesting stories, extracting knowledge, canonicalizing entities, and building position/controversy intelligence.

## What you edit manually

| Responsibility | Where |
|----------------|--------|
| Agent logic | `divisions/**/handler.ts` |
| Cron schedules | `schedule.sql` / `schedules.sql` next to steps |
| Turn workflows on (catalog) | [activation.yaml](activation.yaml) |
| Secret **values** | Supabase / Cloudflare dashboards |
| Schema | `supabase/migrations/` |
| Deploy | `supabase functions deploy ...` |
| Schedule crons in DB | Run `schedule.sql` in Supabase SQL Editor |

**Do not edit [manifest.yaml](manifest.yaml)** — it is auto-generated.

## Auto-generated docs

- [manifest.yaml](manifest.yaml) — full step registry (from code + SQL + activation)
- [docs/generated/cron-jobs.md](docs/generated/cron-jobs.md)
- [docs/generated/pipeline-graph.md](docs/generated/pipeline-graph.md)
- [docs/generated/deploy.md](docs/generated/deploy.md)
- [docs/generated/secrets.md](docs/generated/secrets.md) — which env var **names** each step needs

Refresh after pipeline changes:

```bash
npm run agents:refresh
```

## Divisions

| Division | Path | Purpose |
|----------|------|---------|
| 01 Ingestion | [divisions/01-ingestion-engine](divisions/01-ingestion-engine) | NewsAPI, relevance, scrape, clean |
| 02 Processing | [divisions/02-processing-engine](divisions/02-processing-engine) | Chunk, extract, merge |
| 03 Semantic intelligence | [divisions/03-semantic-intelligence-engine](divisions/03-semantic-intelligence-engine) | Canonical links, clustering, viewpoints |
| 06 Business operations | [divisions/06-business-operations](divisions/06-business-operations) | Health, atlas, maintenance |
| Legacy | [divisions/legacy](divisions/legacy) | Deprecated claim-cluster engine |

## Adding a new step

1. Create `divisions/<division>/<workflow>/<step-id>/handler.ts` (+ optional `schedule.sql`).
2. Add stub `supabase/functions/<deploy_name>/index.ts` importing the handler.
3. Run `npm run agents:refresh` (or let the librarian hook run it).
4. When ready to go live: add `<step-id>` to [activation.yaml](activation.yaml), run SQL in Supabase, deploy.

## Incremental cron rollout

1. Add step IDs to `active:` in [activation.yaml](activation.yaml).
2. Run the workflow's `schedule.sql` in Supabase (Vault: `project_url`, `service_role_key`).
3. Run `npm run agents:refresh` and commit.

Suggested order: ingestion → processing → canonical knowledge → position intelligence → ops.

## Librarian

After editing handlers, cron SQL, or stubs, the Cursor librarian runs `npm run agents:refresh`. See [.cursor/skills/librarian/SKILL.md](../.cursor/skills/librarian/SKILL.md).

## Layout

- **Source:** `doxa-agents/divisions/**/handler.ts`
- **Deploy stub:** `supabase/functions/<deploy_name>/index.ts`
- **Shared:** `doxa-agents/shared/utilities/`
- **Schema:** `supabase/migrations/`
