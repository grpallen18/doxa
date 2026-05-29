# 02 Processing engine

Turns cleaned article bodies into structured **story-level** knowledge.

## Workflows

1. **[01-document-processing](01-document-processing/)** — `chunk-story-bodies`
2. **[02-story-extraction](02-story-extraction/)** — `extract-story-entities` (claims, evidence, positions, events)
3. **[03-story-synthesis](03-story-synthesis/)** — `merge-story-entities` → `story_*` tables

Then canonicalization: [03-semantic-intelligence-engine/01-canonical-knowledge](../03-semantic-intelligence-engine/01-canonical-knowledge/).

<!-- AGENTS:BEGIN -->

### 02-processing-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-entities | extract_story_entities | inactive |
| merge-story-entities | merge_story_entities | inactive |

<!-- AGENTS:END -->
