# clean-scraped-content

LLM normalization of raw HTML into `content_clean` for downstream processing.

| Deploy | Notes |
|--------|--------|
| `clean_scraped_content` | Produces clean article body text |

Downstream: enqueues `graph_processing_jobs` for the Python Neo4j graph-worker (see [04-graph-engine](../../04-graph-engine/)). Claims chunking under `02-chunking-engine` is deprecated.
