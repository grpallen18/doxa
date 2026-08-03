# 02 Chunking engine

**Deprecated (Neo4j hybrid Build 1).** Claims extract/QA is replaced by the Python graph-worker. Handlers remain until Build 4 deletion. See [neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md).

## Agents (deprecated)

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-claims](02-extract-story-claims/)** — precision primary-claim extraction per chunk
3. **[03-validate-chunk-claims](03-validate-chunk-claims/)** — hybrid deterministic + LLM review with claim parking
4. **[04-refine-chunk-claims](04-refine-chunk-claims/)** — repair-queue subset full JSON replacement
5. **[05-approve-chunk-claims](05-approve-chunk-claims/)** — per-claim admission control after repair

<!-- AGENTS:BEGIN -->

### 02-chunking-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-claims | extract_story_claims | inactive |
| validate-chunk-claims | validate_chunk_claims | inactive |
| refine-chunk-claims | refine_chunk_claims | inactive |
| approve-chunk-claims | approve_chunk_claims | inactive |

<!-- AGENTS:END -->
