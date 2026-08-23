# Admin observability and debate ops

How operators watch ingest → graph → debate projections after the Health page was replaced.

**UI:** `/admin/observability` (nav: **Observability**). `/admin/health` redirects here.

**Code:** `app/admin/observability/page.tsx`, `components/admin/observability/pipeline-funnel-panel.tsx`, `lib/admin/observability-pipeline-counts.ts`.

## What the page shows

1. **Scrape chart** — success vs failure over `1h` / `24h` / `7d`. Click a bucket to drill into story-level scrape log rows (`/api/admin/observability/scrape-drilldown`).
2. **Pipeline funnel** — Postgres + Neo counts from `GET /api/admin/observability/pipeline-counts`. Question-quarantine counts link to `/admin/graph-controversies#question-quarantine`.

Admin Center (`/admin`) sparkline cards use `GET /api/admin/dashboard-metrics?range=` (`7d` default in the UI, also `30d` / `3m` / `6m` / `1y`). Story Qualification includes KEEP / DROP / **pending** (FIFO relevance gate). Scrape Rate links here.

## Funnel stages (pipeline-counts)

| Block | Source of truth |
|-------|-----------------|
| Ingest | `stories` row count |
| Relevance | KEEP / DROP / PENDING / unclassified (`relevance_status`) |
| Scrape / clean | `get_health_report`-style awaiting + 24h fail/success |
| Graph jobs | `graph_processing_jobs` by status (pending, running, failed, quarantined, …) |
| Neo | `lib/neo4j/queries/pipeline-counts.ts` (empty if Aura is not configured) |
| Projections | `graph_controversies` (open / developing / closed), publish-block reasons, viewpoints, evidence, people |

**503** if `SUPABASE_SERVICE_ROLE_KEY` is missing. **403** if the user is not admin.

## Debate list and question quarantine

**UI:** `/admin/graph-controversies` (nav: **Debate**).

- Status tabs: all / open / developing / closed (`GET /api/admin/graph-controversies?status=`).
- Detail: `/admin/graph-controversies/[uid]` — viewpoints, evidence, assessments; link into Neo as a **question** hub when present.
- **Question quarantine** — `GET /api/admin/graph-quarantine` loads Neo `Decision` nodes with `status = 'quarantined'` and `decisionType` in `question_match`, `question_answer`. Minting only quarantines weak-same matches; fail/0-confidence is `rejected` (not this queue). See [debate-pipeline README](../doxa-agents/departments/06-debate-engine/debate-pipeline/README.md).

If Neo4j env is unset, quarantine returns `[]` (no throw). The page still lists SQL projections.

## Related admin surfaces

| Path | Use |
|------|-----|
| `/admin` | Metrics + settings (OpenAI models, global layout/theme, Neo colors) |
| `/admin/stories` | Story hub, ingestion/extraction/canonical, run-step |
| `/admin/neo` | Union / hub graph (needs Aura on the server) |
| `/admin/agents/[stepId]` | Prompt store |

Story run-step isolation: [pipeline-test-params.md](../doxa-agents/docs/pipeline-test-params.md).

## Pitfalls

- Consumer `/c/[uid]` and `/api/explore/controversies/[uid]` only show **`open`** controversies. Use Debate admin to inspect developing/closed and `publish_block_reason`.
- Legacy `/api/admin/health/scrape-*` routes still work; they re-export observability handlers. New code should call `/api/admin/observability/*`.
- Funnel “people” is `graph_people`. Empty `/people` in the product usually means `project_person_profiles` has not run.
- Relevance gate claims the **oldest** unclassified stories first (FIFO) unless `lookback_days` is passed — [relevance-gate README](../doxa-agents/departments/01-ingestion-engine/02-relevance-gate/README.md).
