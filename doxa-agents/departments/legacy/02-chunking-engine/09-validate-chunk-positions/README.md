# validate-chunk-positions

Hybrid positions review: deterministic pre-checks plus LLM review (`positions_qa_review_report`). Sets chunk status to `passed`, `needs_refinement`, or `needs_human_review`.

| Deploy name | Queue stage |
|-------------|-------------|
| `validate_chunk_positions` | `validate_positions` (`pending`) |

Upstream: [08-extract-story-positions](../08-extract-story-positions/). On `needs_refinement`: [10-refine-chunk-positions](../10-refine-chunk-positions/) then re-review. Downstream: [merge-story-positions](../../03-merging-engine/02-merge-story-positions/) after all chunks `passed`.
