# 04 Graph engine

Enqueue and wake the Python Neo4j graph-worker after story bodies are cleaned. The worker writes Phase 0 utterance-grounded graphs (Document / Segment / Utterance).

Steering: [docs/architecture/neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md)  
Validation: [docs/architecture/phase0-validation.md](../../docs/architecture/phase0-validation.md)  
Worker: [services/graph-worker](../../../services/graph-worker/)

## Agents

1. **[01-enqueue-graph-job](01-enqueue-graph-job/)** — insert/reset `graph_processing_jobs` for a story (manual reprocess)
2. **[02-trigger-graph-worker](02-trigger-graph-worker/)** — HTTP wake to `GRAPH_WORKER_URL` (`POST /run`)

Automatic enqueue also runs from [clean-scraped-content](../01-ingestion-engine/05-clean-scraped-content/) after `content_clean` is written.

<!-- AGENTS:BEGIN -->

### 04-graph-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| enqueue-graph-job | enqueue_graph_job | inactive |
| trigger-graph-worker | trigger_graph_worker | inactive |

<!-- AGENTS:END -->
