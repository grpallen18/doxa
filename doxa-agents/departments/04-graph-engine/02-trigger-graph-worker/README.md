# trigger-graph-worker

Wake the Python graph-worker poll loop via `POST {GRAPH_WORKER_URL}/run`.

| Deploy | Notes |
|--------|--------|
| `trigger_graph_worker` | Requires `GRAPH_WORKER_URL`. Optional `GRAPH_WORKER_SECRET` as Bearer. |

Does not process jobs itself — only signals the worker.
