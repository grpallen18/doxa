# 02 Processing engine

Turns cleaned article bodies into structured **story-level** knowledge.

## Agents (run in order)

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-entities](02-extract-story-entities/)** — per-chunk LLM extraction (claims, evidence, positions, events)
3. **[extraction-qa](extraction-qa/)** — chunk review → refine → validate (max one repair cycle)
4. **[03-merge-story-entities](03-merge-story-entities/)** — merge chunks into `story_*` tables
5. **[extraction-qa](extraction-qa/)** — merge review → refine → validate before canonicalization

Then canonicalization: [03-semantic-intelligence-engine](../03-semantic-intelligence-engine/).

<!-- AGENTS:BEGIN -->

### 02-processing-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-entities | extract_story_entities | inactive |
| merge-story-entities | merge_story_entities | inactive |
| review-chunk-extraction | review_chunk_extraction | inactive |
| refine-chunk-extraction | refine_chunk_extraction | inactive |
| validate-chunk-extraction | validate_chunk_extraction | inactive |
| review-merged-extraction | review_merged_extraction | inactive |
| refine-merged-extraction | refine_merged_extraction | inactive |
| validate-merged-extraction | validate_merged_extraction | inactive |

<!-- AGENTS:END -->
