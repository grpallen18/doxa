# Admin Observability

Operator dashboard at **`/admin/observability`** (admin JWT). **`/admin/health` redirects here.**

Nav: Admin Center → Observability (`components/admin/admin-center-nav.tsx`).

## What it shows

1. **KPI cards** — ingest Keep/Drop/pending, scrape success rate, graph-job outcomes, Neo counts (documents → controversies), L3 queue depth. Data: `GET /api/admin/health-metrics` plus range/snapshot routes. IDs live in `lib/admin/gather-health-metrics.ts`.
2. **Pipeline funnel** — story counts through relevance → scrape → clean → `graph_processing_jobs` → Neo → Postgres projections → L3 queue/proposals. Data: `GET /api/admin/observability/pipeline-counts` (`lib/admin/observability-pipeline-counts.ts`).
3. **Scrape time series** — success vs failure for `?range=1h|24h|7d` (`/api/admin/observability/scrape-stats`). Drill into a bucket (`scrape-drilldown`) or publisher (`scrape-stats-by-source`).

Empty funnel stages still render; cards may link into Stories / Neo / Debate when an `href` is set.

## Related admin surfaces

| Route | Use |
|-------|-----|
| `/admin` | Search + metric widgets |
| `/admin/stories` | Ingestion walkthrough for one article |
| `/admin/neo` | Aura inspection |
| `/admin/graph-controversies` | Projected controversies |
| `/admin/l3-proposals` | Override Slack: filter `pending_approval` (default), apply/reject/revert |

## Constraints

- All `/api/admin/*` routes need role `admin`. Missing `SUPABASE_SERVICE_ROLE_KEY` yields **503** on funnel/run-step/L3 apply.
- Neo KPI numbers need `NEO4J_*` in the Next.js env (same Aura instance as the graph-worker).
- L3 funnel counts are Postgres (`l3_review_queue`, `l3_proposals`, `graph_questions`) — they lag Neo until `project_debate_summaries` runs.
- Debate rebuild (`DEBATE_REBUILD_MODE=true`) empties the public explore APIs; Observability still reads ops tables.

## Pitfalls

- **Zero controversies on home, non-zero Neo questions:** projection not run, or `graph_controversies.status` is not `open`.
- **Queue pending forever:** Grok curator not claiming (`claim_review_batch`); Edge `run_l3_curator` cron is **off** — invoke manually or check xAI schedule.
- **Scrape failure spike:** open drilldown, then Stories for that URL; Worker secrets in [ENV_SETUP.md](../ENV_SETUP.md).
