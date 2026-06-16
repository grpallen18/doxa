# approve-chunk-claims

Per-claim admission control for repaired claims. Parks approved rows; re-queues fixable rejections to refine.

| Deploy name | Queue stage |
|-------------|-------------|
| `approve_chunk_claims` | `approve_claims` (`awaiting_approval`) |

Upstream: [04-refine-chunk-claims](../04-refine-chunk-claims/). Downstream: [merge-story-claims](../../03-merging-engine/01-merge-story-claims/) when chunk `passed`.
