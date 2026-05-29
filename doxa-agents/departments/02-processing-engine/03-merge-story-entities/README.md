# merge-story-entities

Merges per-chunk extractions into one story-level graph: **story_claims**, **story_evidence**, **story_positions**, **story_events**, and link tables (`story_claim_evidence_links`, `story_position_claim_links`, `story_position_evidence_links`, `story_event_claim_links`, `story_event_evidence_links`). Position→event context is derived via claims/evidence, not persisted as direct edges.

| Deploy name | Notes |
|-------------|--------|
| `merge_story_entities` | Invokes `link_canonical_positions` and `link_canonical_events` when new rows are created |

Canonical linking (dedupe to global `claims`, `events`, `positions`) is documented in [AGENTS.md](../../../AGENTS.md#canonicalization).
