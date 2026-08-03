# enqueue-graph-job

Manually enqueue (or re-enqueue) a Neo4j graph-processing job for a story with `content_clean`.

| Deploy | Notes |
|--------|--------|
| `enqueue_graph_job` | Requires `story_id`. Skips if a job is already `running`. |

Body: `{ "story_id": "<uuid>", "force_stale"?: true }` — `force_stale` clears running locks older than 6 hours.
