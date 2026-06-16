# merge-story-claims

Merges **parked** per-chunk claims into `story_claims` via LLM dedupe/consolidation.

| Deploy name | Gate |
|-------------|------|
| `merge_story_claims` | `get_stories_ready_to_merge` |

Upstream: chunk lane complete (`passed`, empty repair queue). Downstream: [02-review-merged-extraction](../02-review-merged-extraction/).
