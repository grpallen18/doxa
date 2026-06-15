# 02 Chunking engine

**Active runnable path (admin UI):** chunk → extract claims → review chunk claims.

Downstream steps (refine, positions, merge, canonical, topology) are archived under [`../legacy/`](../legacy/README.md) and shown on the agent-flow canvas as roadmap placeholders only.

## Active agents

1. **[01-chunk-story-bodies](01-chunk-story-bodies/)** — split clean text into `story_chunks`
2. **[02-extract-story-claims](02-extract-story-claims/)** — precision primary-claim extraction per chunk
3. **[03-validate-chunk-claims](03-validate-chunk-claims/)** — hybrid deterministic + LLM review

<!-- AGENTS:BEGIN -->

### 02-chunking-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| chunk-story-bodies | chunk_story_bodies | inactive |
| extract-story-claims | extract_story_claims | inactive |
| validate-chunk-claims | validate_chunk_claims | inactive |

<!-- AGENTS:END -->
