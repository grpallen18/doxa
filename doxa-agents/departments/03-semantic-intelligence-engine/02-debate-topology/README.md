# 02 Debate topology

Layered pipeline: candidate generation → LLM relationship classification → agreement clusters → cluster relationships → controversies → summaries/viewpoints.

| Step | Deploy |
|------|--------|
| [01-assign-ranked-subtopics](01-assign-ranked-subtopics/) | `assign_ranked_subtopics` |
| [02-generate-position-pair-candidates](02-generate-position-pair-candidates/) | `generate_position_pair_candidates` |
| [03-classify-position-relationships](03-classify-position-relationships/) | `classify_position_relationships` |
| [04-build-agreement-clusters](04-build-agreement-clusters/) | `build_agreement_clusters` |
| [05-generate-agreement-cluster-candidates](05-generate-agreement-cluster-candidates/) | `generate_agreement_cluster_candidates` |
| [06-classify-agreement-cluster-relationships](06-classify-agreement-cluster-relationships/) | `classify_agreement_cluster_relationships` |
| [07-build-controversy-clusters](07-build-controversy-clusters/) | `build_controversy_clusters` |
| [08-topology-pipeline](08-topology-pipeline/) | `topology_pipeline` |
| [09-generate-agreement-summaries](09-generate-agreement-summaries/) | `generate_agreement_summaries` |
| [10-generate-viewpoints](10-generate-viewpoints/) | `generate_viewpoints` |
| [11-refresh-topology-candidates](11-refresh-topology-candidates/) | `refresh_topology_candidates` |

Shared crons: [../schedules.sql](../schedules.sql). Architecture: [../../../docs/topology-pipeline.md](../../../docs/topology-pipeline.md).
