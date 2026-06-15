# extract-story-positions

Per-chunk LLM extraction of **positions** (source stances, theses, judgments) into `positions_extraction_json`. Runs in parallel with claims extraction.

| Deploy name | Isolation |
|-------------|-----------|
| `extract_story_positions` | `story_id`, optional `chunk_index` |

Downstream: [09-validate-chunk-positions](../09-validate-chunk-positions/) → [10-refine-chunk-positions](../10-refine-chunk-positions/) QA loop → [merge-story-positions](../../03-merging-engine/02-merge-story-positions/).
