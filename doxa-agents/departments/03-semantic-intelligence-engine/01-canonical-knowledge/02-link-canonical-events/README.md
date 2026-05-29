# link-canonical-events

Links `story_events` to global `events` via embedding similarity.

| Deploy | Story table | Canonical table |
|--------|-------------|-----------------|
| `link_canonical_events` | `story_events` | `events` |

Also invoked by [merge-story-entities](../../02-processing-engine/03-merge-story-entities/) when new story events are created.
