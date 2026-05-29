# Topology pipeline

Post-canonicalization debate intelligence in explicit layers.

## Layers

1. **Tagging** — `assign_ranked_subtopics` assigns topic/subtopic tags to canonical positions.
2. **Position candidates** — `generate_position_pair_candidates` scores pairs (subtopic overlap, embedding, claim/story/source proximity).
3. **Position relationships** — `classify_position_relationships` LLM labels: same_family, agree, oppose, qualify, broader, narrower, compatible, orthogonal, unrelated.
4. **Agreement clusters** — `build_agreement_clusters` hard-unions same_family/agree; soft-attaches qualify/broader/narrower.
5. **Cluster candidates** — `generate_agreement_cluster_candidates` scores cluster pairs (tags, centroids, claims, stories, events).
6. **Cluster relationships** — `classify_agreement_cluster_relationships` LLM labels: opposed, competing, compatible, orthogonal, nested, partially_overlapping.
7. **Controversies** — `build_controversy_clusters` assembles multi-sided debates from opposed/competing edges with `controversy_cluster_lineage`.
8. **Narratives** — `generate_agreement_summaries`, `generate_viewpoints`.

## Orchestration

- **Crons** (see [schedules.sql](../departments/03-semantic-intelligence-engine/schedules.sql)): candidates + classify run incrementally; `topology_pipeline` rebuilds clusters periodically.
- **`topology_pipeline`** chains steps 4–7; summaries/viewpoints on separate crons or when `skip_summaries_viewpoints` is false.

## Traceability

Controversy → `controversy_cluster_lineage` → `agreement_cluster_relationships` → agreement clusters → positions → claims/stories (Atlas scope API `/api/atlas/scope/controversy/{id}`).

Story evidence stays at story level (not canonicalized).

## Tables

| Table | Purpose |
|-------|---------|
| `position_pair_candidates` | Deterministic position-pair queue |
| `position_relationships` | LLM position-pair labels |
| `agreement_cluster_positions.membership_kind` | core vs attached |
| `agreement_cluster_pair_candidates` | Cluster-pair queue |
| `agreement_cluster_relationships` | LLM cluster-pair labels |
| `controversy_cluster_lineage` | Provenance for controversy assembly |
