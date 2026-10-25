# enqueue-graph-job

Manually enqueue (or re-enqueue) a Neo4j graph-processing job for a story with `content_clean`.

| Deploy | Notes |
|--------|--------|
| `enqueue_graph_job` | JWT-off. Bearer must be `SUPABASE_SERVICE_ROLE_KEY` or `INTERNAL_FN_SECRET`. |

Body: `{ "story_id": "<uuid>", "force_stale"?: true }` — `force_stale` clears `running` locks older than **360 minutes**. Skips if a younger job is already `running`. Requires `story_bodies.content_clean`.

Does not wake the worker. Admin Neo Reprocess uses a **1-minute** stale window and also only enqueues.

See the department [README](../README.md) for invoke examples.
