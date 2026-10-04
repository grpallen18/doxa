# 04 Graph engine

Enqueue and optionally wake the Python Neo4j graph-worker after story bodies are cleaned. The worker writes **Phase 0+1+2a** (Document / Utterance / Proposition / Argument) in one job.

Steering: [docs/architecture/neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md)  
Worker: [services/graph-worker](../../../services/graph-worker/)  
Admin explorer: [docs/admin-neo-explorer.md](../../../docs/admin-neo-explorer.md)

## Agents

1. **[01-enqueue-graph-job](01-enqueue-graph-job/)** — insert/reset `graph_processing_jobs` for a story (manual reprocess)
2. **[02-trigger-graph-worker](02-trigger-graph-worker/)** — HTTP wake to `GRAPH_WORKER_URL` (`POST /run`)

Automatic enqueue also runs from [clean-scraped-content](../01-ingestion-engine/05-clean-scraped-content/) after `content_clean` is written. **`trigger_graph_worker` is not called** by clean, admin Reprocess, or any cron — the Azure poll loop (5s) is the normal consumer.

## Invoke

JWT-off. POST with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (or `INTERNAL_FN_SECRET`). User JWT is rejected (`requireInternalAuth`).

```bash
# Enqueue one cleaned story
curl -sS "$SUPABASE_URL/functions/v1/enqueue_graph_job" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"story_id":"<uuid>","force_stale":true}'

# Optional wake (only if GRAPH_WORKER_SECRET matches the worker)
curl -sS "$SUPABASE_URL/functions/v1/trigger_graph_worker" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Stale running jobs

| Path | `force_stale` window |
|------|----------------------|
| `enqueue_graph_job` | **360** minutes (`STALE_RUNNING_MINUTES`) |
| Admin `/api/admin/neo/documents/[storyId]/reprocess` | **1** minute (`ADMIN_STALE_RUNNING_MINUTES`) |

A `running` job younger than the window blocks enqueue. Claim RPC also skips any story that already has a `running` row.

## Related ops

- Aura Free headroom: [graph-hygiene](../05-business-operations/graph-hygiene/) `prune_oldest_documents` (default dry-run)
- Pause ingest enqueue: [clean-scraped-content/unschedule.sql](../01-ingestion-engine/05-clean-scraped-content/)

<!-- AGENTS:BEGIN -->

### 04-graph-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| enqueue-graph-job | enqueue_graph_job | inactive |
| trigger-graph-worker | trigger_graph_worker | inactive |

<!-- AGENTS:END -->
