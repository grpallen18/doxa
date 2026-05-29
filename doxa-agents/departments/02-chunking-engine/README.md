# 02 Chunking engine

Split clean article bodies into chunks, extract structured entities per chunk, and run chunk-level extraction QA.

## Agents (run in order)

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-entities](02-extract-story-entities/)** — per-chunk LLM extraction (claims, evidence, positions, events)
3. **[03-review-chunk-extraction](03-review-chunk-extraction/)** — completeness reviewer (chunk)
4. **[04-refine-chunk-extraction](04-refine-chunk-extraction/)** — patch agent (chunk, max one repair cycle)
5. **[05-validate-chunk-extraction](05-validate-chunk-extraction/)** — judge (chunk)

Downstream: [03-merging-engine](../03-merging-engine/) → [04-semantic-intelligence-engine](../04-semantic-intelligence-engine/).

<!-- AGENTS:BEGIN -->

### 02-chunking-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-entities | extract_story_entities | inactive |
| review-chunk-extraction | review_chunk_extraction | inactive |
| refine-chunk-extraction | refine_chunk_extraction | inactive |
| validate-chunk-extraction | validate_chunk_extraction | inactive |

<!-- AGENTS:END -->
