# 01 Sourcing

Discover candidate stories and gate them before content acquisition.

| Step | Deploy | Notes |
|------|--------|--------|
| [ingest-newsapi](01-ingest-newsapi/) | `ingest-newsapi` | Poll NewsAPI; insert `stories` rows |
| [relevance-gate](02-relevance-gate/) | `relevance_gate` | LLM relevance score; sets `relevance_status` |

Next: [02-content-acquisition](../02-content-acquisition/) — scrape and clean article bodies.
