# 03 Story synthesis

Merges per-chunk extractions into one story-level graph: **story_claims**, **story_evidence**, **story_positions**, **story_events**, and bridge tables.

| Step | Deploy name | Notes |
|------|-------------|--------|
| [merge-story-claims](merge-story-claims/) | `merge_story_claims` | Invokes `link_canonical_positions` and `link_canonical_events` when new rows are created |

Canonical linking (dedupe to global `claims`, `events`, `positions`) is documented in [AGENTS.md](../../../AGENTS.md#canonicalization).
