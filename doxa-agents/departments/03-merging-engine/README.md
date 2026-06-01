# 03 Merging engine

Merge chunk claims into `story_claims` and run merge-level extraction QA before canonicalization.

## Agents (run in order)

1. **[01-merge-story-claims](01-merge-story-claims/)** — dedupe chunk claims → `story_claims`
2. **[02-review-merged-extraction](02-review-merged-extraction/)** — completeness reviewer (story)
3. **[03-refine-merged-extraction](03-refine-merged-extraction/)** — patch agent (merge, max one repair cycle)
4. **[04-validate-merged-extraction](04-validate-merged-extraction/)** — judge before canonicalization

Upstream: [02-chunking-engine](../02-chunking-engine/) (chunk claims QA passed). Downstream: [04-semantic-intelligence-engine](../04-semantic-intelligence-engine/).

Legacy multi-atom merge: [legacy/merge-story-entities](../legacy/merge-story-entities/).

<!-- AGENTS:BEGIN -->

### 03-merging-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| merge-story-claims | merge_story_claims | inactive |
| review-merged-extraction | review_merged_extraction | inactive |
| refine-merged-extraction | refine_merged_extraction | inactive |
| validate-merged-extraction | validate_merged_extraction | inactive |

<!-- AGENTS:END -->
