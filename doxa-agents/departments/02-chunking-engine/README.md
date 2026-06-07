# 02 Chunking engine

Claims-first extraction pipeline. Legacy multi-atom QA steps remain in repo but inactive.

## Active agents (run in order)

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-claims](02-extract-story-claims/)** — precision primary-claim extraction per chunk
3. **[03-validate-chunk-claims](03-validate-chunk-claims/)** — chunk QA loop entry (deterministic validate today)

**Chunk QA loop:** validate chunk claims until every chunk is `passed`. Review/refine chunk agents will be added incrementally (legacy agents exist but are inactive).

Downstream: [03-merging-engine/01-merge-story-claims](../03-merging-engine/01-merge-story-claims/) runs only after all chunks passed.

## Inactive (legacy multi-atom path)

- [03-standardize-chunk-extraction](03-standardize-chunk-extraction/)
- [04-refine-chunk-extraction](04-refine-chunk-extraction/)
- [05-validate-chunk-extraction](05-validate-chunk-extraction/)
- [06-link-chunk-entities](06-link-chunk-entities/)
- [legacy/extract-story-entities](../legacy/extract-story-entities/)

## Future atom agents (stubs)

- [07-extract-story-evidence](07-extract-story-evidence/)
- [08-extract-story-positions](08-extract-story-positions/)
- [09-extract-story-events](09-extract-story-events/)

<!-- AGENTS:BEGIN -->

### 02-chunking-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-claims | extract_story_claims | inactive |
| standardize-chunk-extraction | standardize_chunk_extraction | inactive |
| validate-chunk-claims | validate_chunk_claims | inactive |
| refine-chunk-extraction | refine_chunk_extraction | inactive |
| validate-chunk-extraction | validate_chunk_extraction | inactive |
| link-chunk-entities | link_chunk_entities | inactive |

<!-- AGENTS:END -->
