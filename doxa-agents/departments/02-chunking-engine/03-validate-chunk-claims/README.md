# validate-chunk-claims

Hybrid claims review: deterministic pre-checks plus LLM review (`extraction_qa_review_report`). Sets chunk status to `complete` or `needs_refinement`. Per-claim outcomes: **pass** (park), **needs_repair** (revise), or **drop**. No add-ops / missing claims; no human-review path.

| Deploy name | Queue stage |
|-------------|-------------|
| `validate_chunk_claims` | `validate_claims` (`pending`) |

Upstream: [02-extract-story-claims](../02-extract-story-claims/). On `needs_refinement`: [04-refine-chunk-claims](../04-refine-chunk-claims/) → [05-approve-chunk-claims](../05-approve-chunk-claims/) (no re-review). Fast path parks all claims and sets `complete`. Downstream: [merge-story-claims](../../03-merging-engine/01-merge-story-claims/) when all chunks complete.
