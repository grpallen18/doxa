# refine-chunk-claims

Repairs only claims in `repair_queue` via full JSON replacement LLM. Normalizes output, creates immutable refiner version, sets `awaiting_approval`. Extra model claims are dropped (no adds). Per-chunk failures leave the chunk queued, or after max attempts drop remaining repair claims and set `complete` (parked claims kept).

| Deploy name | Queue stage |
|-------------|-------------|
| `refine_chunk_claims` | `refine` (`needs_refinement` + non-empty repair_queue) |

Upstream: [03-validate-chunk-claims](../03-validate-chunk-claims/). Downstream: [05-approve-chunk-claims](../05-approve-chunk-claims/).
