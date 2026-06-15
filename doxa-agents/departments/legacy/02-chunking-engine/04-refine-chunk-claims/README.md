# refine-chunk-claims

Applies LLM patches to fix reviewer findings on claims-only chunk extraction. Re-queues chunk for review (`pending`) after a successful refine.

| Deploy name | Queue stage |
|-------------|-------------|
| `refine_chunk_claims` | `refine` (`needs_refinement`) |

Upstream: [03-validate-chunk-claims](../03-validate-chunk-claims/). Downstream: re-run review until all chunks `passed`, then [merge-story-claims](../../03-merging-engine/01-merge-story-claims/).
