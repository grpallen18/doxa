# link-canonical-positions

Links `story_positions` to global `positions` via embedding similarity. Positions are canonicalized here—not created in position-intelligence.

| Deploy | Story table | Canonical table |
|--------|-------------|-----------------|
| `link_canonical_positions` | `story_positions` | `positions` |

Cron: see [schedules.sql](../schedules.sql). Invokes [assign-ranked-subtopics](../12-assign-ranked-subtopics/) after linking.
