# 02 Chunking engine

Claims-first extraction pipeline with a parallel **positions** track. Legacy multi-atom QA steps remain in repo but inactive.

## Active agents (run in order)

### Claims track

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-claims](02-extract-story-claims/)** — precision primary-claim extraction per chunk
3. **[03-validate-chunk-claims](03-validate-chunk-claims/)** — hybrid deterministic + LLM review
4. **[04-refine-chunk-claims](04-refine-chunk-claims/)** — patch claims from review findings (optional loop step)

**Chunk QA loop:** review chunk claims → refine when needed → re-review until every chunk is `passed`.

Downstream: [03-merging-engine/01-merge-story-claims](../03-merging-engine/01-merge-story-claims/) runs only after all chunks passed.

### Positions track (parallel)

1. **[08-extract-story-positions](08-extract-story-positions/)** — stance/thesis extraction per chunk → `positions_extraction_json`
2. **[09-validate-chunk-positions](09-validate-chunk-positions/)** — positions review
3. **[10-refine-chunk-positions](10-refine-chunk-positions/)** — positions refine loop

Downstream: [03-merging-engine/02-merge-story-positions](../03-merging-engine/02-merge-story-positions/) after all chunks `positions_qa_status = passed`.

## Inactive (legacy multi-atom path)

- [03-standardize-chunk-extraction](03-standardize-chunk-extraction/)
- [04-refine-chunk-extraction](04-refine-chunk-extraction/)
- [05-validate-chunk-extraction](05-validate-chunk-extraction/)
- [06-link-chunk-entities](06-link-chunk-entities/)
- [legacy/extract-story-entities](../legacy/extract-story-entities/)

## Future atom agents (stubs)

- [07-extract-story-evidence](07-extract-story-evidence/)
- [11-extract-story-events](11-extract-story-events/)

<!-- AGENTS:BEGIN -->

### 02-chunking-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-claims | extract_story_claims | inactive |
| standardize-chunk-extraction | standardize_chunk_extraction | inactive |
| validate-chunk-claims | validate_chunk_claims | inactive |
| refine-chunk-claims | refine_chunk_claims | inactive |
| refine-chunk-extraction | refine_chunk_extraction | inactive |
| validate-chunk-extraction | validate_chunk_extraction | inactive |
| link-chunk-entities | link_chunk_entities | inactive |
| extract-story-positions | extract_story_positions | inactive |
| validate-chunk-positions | validate_chunk_positions | inactive |
| refine-chunk-positions | refine_chunk_positions | inactive |

<!-- AGENTS:END -->
