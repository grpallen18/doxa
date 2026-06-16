# validate-chunk-claims

Hybrid claims review: deterministic pre-checks plus LLM review (`extraction_qa_review_report`). Sets chunk status to `passed`, `needs_refinement`, or `needs_human_review`. The handler writes `resolved_status` on the review report (mirrors `extraction_qa_status` and `validation_report.recommended_status`) so export/UI fields stay aligned.

| Deploy name | Queue stage |
|-------------|-------------|
| `validate_chunk_claims` | `validate_claims` (`pending`) |

Upstream: [02-extract-story-claims](../02-extract-story-claims/). On `needs_refinement`: [04-refine-chunk-claims](../04-refine-chunk-claims/) → [05-approve-chunk-claims](../05-approve-chunk-claims/) (no re-review). Fast path parks all claims and sets `passed`. Downstream: [merge-story-claims](../../03-merging-engine/01-merge-story-claims/) when all chunks merge-ready.
