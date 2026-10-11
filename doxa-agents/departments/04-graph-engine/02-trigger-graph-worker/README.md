# trigger-graph-worker

Wake the Python graph-worker poll loop via `POST {GRAPH_WORKER_URL}/run`. Does not process jobs itself.

| Deploy | Notes |
|--------|--------|
| `trigger_graph_worker` | JWT-off. Requires Edge secret `GRAPH_WORKER_URL`. |

**Not on the critical path.** Jobs are claimed by the worker’s 5s poll. No cron or clean step invokes this function.

## Secret semantics

- Worker: if `GRAPH_WORKER_SECRET` is **unset**, `POST /run` is always **401** (fail closed). Polling still works.
- Edge: sends `Authorization: Bearer $GRAPH_WORKER_SECRET` only when that Edge secret is set.
- Azure `deploy.ps1` **always** sets a worker secret. If Edge is missing the same value, wake returns **502**.

See the department [README](../README.md) for invoke examples.
