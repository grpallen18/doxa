# 03 Merging engine

Merge chunk claims into `story_claims`, and chunk positions into `story_positions`. Merge-level extraction QA runs on the claims merge path before canonicalization.

## Agents (run in order)

### Claims merge

1. **[01-merge-story-claims](01-merge-story-claims/)** — dedupe chunk claims → `story_claims` (requires all chunks `passed`)
2. **[02-review-merged-extraction](02-review-merged-extraction/)** — merge QA loop: completeness reviewer
3. **[03-refine-merged-extraction](03-refine-merged-extraction/)** — merge QA loop branch when review requests refinement (max one cycle)
4. **[04-validate-merged-extraction](04-validate-merged-extraction/)** — merge QA loop: approve before canonicalization

**Merge QA loop:** review → refine (when needed) → approve. Canonical linkers require `stories.extraction_qa_status = passed`.

### Positions merge (parallel)

1. **[02-merge-story-positions](02-merge-story-positions/)** — dedupe chunk positions → `story_positions` (requires all chunks `positions_qa_status = passed`)

Upstream: [02-chunking-engine](../02-chunking-engine/) chunk QA passed. Downstream: [04-semantic-intelligence-engine](../04-semantic-intelligence-engine/).

Legacy multi-atom merge: [legacy/merge-story-entities](../legacy/merge-story-entities/).

<!-- AGENTS:BEGIN -->

### 03-merging-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| merge-story-claims | merge_story_claims | inactive |
| merge-story-positions | merge_story_positions | inactive |
| review-merged-extraction | review_merged_extraction | inactive |
| refine-merged-extraction | refine_merged_extraction | inactive |
| validate-merged-extraction | validate_merged_extraction | inactive |

<!-- AGENTS:END -->
