# 02 Chunking engine

Split clean article bodies into chunks, extract structured entities per chunk, run chunk-level extraction QA, link atoms, then merge.

## Agents (run in order)

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-entities](02-extract-story-entities/)** — per-chunk LLM extraction (atoms + provenance only)
3. **[03-review-chunk-extraction](03-review-chunk-extraction/)** — atom/provenance reviewer (chunk)
4. **[04-refine-chunk-extraction](04-refine-chunk-extraction/)** — patch agent (chunk, max one repair cycle)
5. **[05-validate-chunk-extraction](05-validate-chunk-extraction/)** — provenance judge → `atoms_passed`
6. **[06-link-chunk-entities](06-link-chunk-entities/)** — semantic link arrays → `passed`
7. Downstream: [03-merging-engine](../03-merging-engine/) → [04-semantic-intelligence-engine](../04-semantic-intelligence-engine/)

<!-- AGENTS:BEGIN -->

### 02-chunking-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-entities | extract_story_entities | inactive |
| review-chunk-extraction | review_chunk_extraction | inactive |
| refine-chunk-extraction | refine_chunk_extraction | inactive |
| validate-chunk-extraction | validate_chunk_extraction | inactive |
| link-chunk-entities | link_chunk_entities | inactive |

<!-- AGENTS:END -->
