# approve-chunk-claims

Per-claim admission for repaired claims. **Approve** parks; **reject** (fixable) requeues to refine; **drop** (unfixable) goes to the drop sink. After refine attempt caps, remaining repair/pending claims are dropped; parked claims become the merge set. Terminal chunk status is `complete`.

| Deploy name | Queue stage |
|-------------|-------------|
| `approve_chunk_claims` | `approve_claims` (`awaiting_approval`) |

Upstream: [04-refine-chunk-claims](../04-refine-chunk-claims/). Downstream: [merge-story-claims](../../03-merging-engine/01-merge-story-claims/) when chunk `complete`.
