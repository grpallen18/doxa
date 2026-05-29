# 04 Semantic intelligence engine

Canonicalize story-level entities and build debate topology on global graphs.

## Workflows

| Workflow | Purpose |
|----------|---------|
| [01-canonical-knowledge](01-canonical-knowledge/) | Link story claims/events/positions; backfill stances |
| [02-debate-topology](02-debate-topology/) | Candidate queues, relationship classification, agreement/controversy clusters, summaries |
| [03-governance](03-governance/) | Subtopic seed, topic processing, link review |

Architecture: [docs/topology-pipeline.md](../docs/topology-pipeline.md). Shared crons: [schedules.sql](schedules.sql).

<!-- AGENTS:BEGIN -->

### 04-semantic-intelligence-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| orphan-cleanup-weekly | — | inactive |
| link-canonical-claims | link_canonical_claims | inactive |
| link-canonical-events | link_canonical_events | inactive |
| link-canonical-positions | link_canonical_positions | inactive |
| update-stances | update_stances | inactive |
| assign-ranked-subtopics | assign_ranked_subtopics | inactive |
| generate-position-pair-candidates | generate_position_pair_candidates | inactive |
| classify-position-relationships | classify_position_relationships | inactive |
| build-agreement-clusters | build_agreement_clusters | inactive |
| generate-agreement-cluster-candidates | generate_agreement_cluster_candidates | inactive |
| classify-agreement-cluster-relationships | classify_agreement_cluster_relationships | inactive |
| build-controversy-clusters | build_controversy_clusters | inactive |
| topology-pipeline | topology_pipeline | inactive |
| generate-agreement-summaries | generate_agreement_summaries | inactive |
| generate-viewpoints | generate_viewpoints | inactive |
| refresh-topology-candidates | refresh_topology_candidates | inactive |
| seed-subtopic-embeddings | seed_subtopic_embeddings | inactive |
| process-topic | process_topic | inactive |
| review-link-suggestion | review_link_suggestion | inactive |

<!-- AGENTS:END -->
