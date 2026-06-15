# merge-story-positions

Merge chunk `positions_extraction_json` blobs into `story_positions` after all chunks pass positions QA.

| Deploy name | Ready gate |
|-------------|------------|
| `merge_story_positions` | `get_stories_ready_to_merge_positions` |

Upstream: all chunks `positions_qa_status = passed`. Downstream: `link_canonical_positions`.
