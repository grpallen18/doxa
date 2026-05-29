# extraction-qa

Staged quality pipeline for chunk and merged extractions before merge and canonicalization.

| Step | Deploy | Role |
|------|--------|------|
| [01-review-chunk-extraction](01-review-chunk-extraction/) | `review_chunk_extraction` | Completeness reviewer (chunk) |
| [02-refine-chunk-extraction](02-refine-chunk-extraction/) | `refine_chunk_extraction` | Patch agent (chunk, max 1 cycle) |
| [03-validate-chunk-extraction](03-validate-chunk-extraction/) | `validate_chunk_extraction` | Judge (chunk) |
| [04-review-merged-extraction](04-review-merged-extraction/) | `review_merged_extraction` | Completeness reviewer (story) |
| [05-refine-merged-extraction](05-refine-merged-extraction/) | `refine_merged_extraction` | Patch agent (merge, max 1 cycle) |
| [06-validate-merged-extraction](06-validate-merged-extraction/) | `validate_merged_extraction` | Judge before canonicalization |

Upstream: [02-extract-story-entities](../02-extract-story-entities/) → chunk QA → [03-merge-story-entities](../03-merge-story-entities/) → merge QA → [01-canonical-knowledge](../../03-semantic-intelligence-engine/01-canonical-knowledge/).
