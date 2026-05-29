# 01 Canonical knowledge

Links **story-level** rows to global canonical entities (embedding similarity). Positions are canonicalized here the same way as claims—not created in position-intelligence.

| Step | Story table | Canonical table |
|------|-------------|-----------------|
| `link-canonical-claims` | `story_claims` | `claims` |
| `link-canonical-events` | `story_events` | `events` |
| `link-canonical-positions` | `story_positions` | `positions` |
| `update-stances` | `story_claims` | stance backfill |

Upstream: [02-processing-engine](../../02-processing-engine/) extracts and merges all four entity types from article text.
