# 01 Ingestion engine

Discover stories, gate relevance, scrape bodies, and produce `content_clean` for processing.

## Agents (run in order)

1. **[01-ingest-newsapi](01-ingest-newsapi/)** — poll NewsAPI
2. **[02-relevance-gate](02-relevance-gate/)** — LLM relevance scoring
3. **[03-scrape-story-content](03-scrape-story-content/)** — dispatch scrape worker
4. **[04-receive-scraped-content](04-receive-scraped-content/)** — worker callback
5. **[05-clean-scraped-content](05-clean-scraped-content/)** — raw HTML → `content_clean`
6. **[06-review-pending-stories](06-review-pending-stories/)** — re-review pending stories

Downstream: [02-chunking-engine](../02-chunking-engine/).

<!-- AGENTS:BEGIN -->

### 01-ingestion-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| ingest-newsapi | ingest-newsapi | active |
| relevance-gate | relevance_gate | inactive |
| scrape-story-content | scrape_story_content | active |
| receive-scraped-content | receive_scraped_content | inactive |
| clean-scraped-content | clean_scraped_content | inactive |
| review-pending-stories | review_pending_stories | inactive |

<!-- AGENTS:END -->
