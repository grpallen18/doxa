# validate-chunk-claims

Deterministic QA for claims-only chunk extraction. Sets chunk `extraction_qa_status` to `passed` or `needs_human_review`.

| Deploy name | Queue stage |
|-------------|-------------|
| `validate_chunk_claims` | `validate_claims` |

Upstream: [extract-story-claims](../02-extract-story-claims/). Downstream: [merge-story-claims](../../03-merging-engine/01-merge-story-claims/).
