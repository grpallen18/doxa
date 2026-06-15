# merge-story-claims

Merge chunk-level primary claims into `story_claims` (claims-only pipeline).

| Deploy name | Output |
|-------------|--------|
| `merge_story_claims` | `story_claims` |

Upstream: all chunks `extraction_qa_status = passed`. Downstream: merge QA → `link_canonical_claims`.

Legacy full-graph merge: [merge-story-entities](../../legacy/merge-story-entities/) (deprecated).
