# merge-story-entities

Merges per-chunk extractions into one story-level graph: **story_claims**, **story_evidence**, **story_positions**, **story_events**, and link tables. Requires chunk QA `passed` before merge.

| Deploy name | Notes |
|-------------|--------|
| `merge_story_entities` | Sets story `extraction_qa_status` pending for merge QA |

Upstream: [05-validate-chunk-extraction](../../02-chunking-engine/05-validate-chunk-extraction/). Next: [02-review-merged-extraction](../02-review-merged-extraction/). Canonical linking runs after [04-validate-merged-extraction](../04-validate-merged-extraction/) — see [AGENTS.md](../../../AGENTS.md#canonicalization).
