# clean-scraped-content

LLM normalization of raw HTML into `content_clean` for downstream processing.

| Deploy | Notes |
|--------|--------|
| `clean_scraped_content` | Produces clean article body text; enqueues graph job |

**Selection order**

1. `story_bodies` with `content_clean IS NULL` (full LLM clean + enqueue).
2. Else cleaned rows whose `stories.graph_status IS NULL` (enqueue-only retry). This recovers orphans where clean succeeded but `enqueueGraphJob` failed — cron can pick them up without re-running the cleaner.

Downstream: enqueues `graph_processing_jobs` for the Python Neo4j graph-worker (see [04-graph-engine](../../04-graph-engine/)). Claims chunking under `02-chunking-engine` is deprecated.
