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

### legacy/04-semantic-intelligence-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| link-canonical-claims | link_canonical_claims | deprecated |
| link-canonical-events | link_canonical_events | deprecated |
| link-canonical-positions | link_canonical_positions | deprecated |
| update-stances | update_stances | deprecated |
| assign-ranked-subtopics | assign_ranked_subtopics | deprecated |
| generate-position-pair-candidates | generate_position_pair_candidates | deprecated |
| classify-position-relationships | classify_position_relationships | deprecated |
| build-agreement-clusters | build_agreement_clusters | deprecated |
| generate-agreement-cluster-candidates | generate_agreement_cluster_candidates | deprecated |
| classify-agreement-cluster-relationships | classify_agreement_cluster_relationships | deprecated |
| build-controversy-clusters | build_controversy_clusters | deprecated |
| topology-pipeline | topology_pipeline | deprecated |
| generate-agreement-summaries | generate_agreement_summaries | deprecated |
| generate-viewpoints | generate_viewpoints | deprecated |
| refresh-topology-candidates | refresh_topology_candidates | deprecated |
| seed-subtopic-embeddings | seed_subtopic_embeddings | deprecated |
| process-topic | process_topic | deprecated |
| review-link-suggestion | review_link_suggestion | deprecated |

<!-- AGENTS:END -->
