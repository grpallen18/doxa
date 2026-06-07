# validate-chunk-claims

Chunk QA loop entry (claims-only path): deterministic validation sets chunk `extraction_qa_status` to `passed` or `needs_human_review`. Future review/refine chunk agents will extend this loop.

| Deploy name | Queue stage |
|-------------|-------------|
| `validate_chunk_claims` | `validate_claims` |

Upstream: [extract-story-claims](../02-extract-story-claims/). Downstream: [merge-story-claims](../../03-merging-engine/01-merge-story-claims/) after all chunks passed.
