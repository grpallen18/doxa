-- Reset position pairs and downstream: agreements, controversies, viewpoints.
-- Keeps canonical_positions, position_subtopics, topics, subtopics.
-- Run clustering_pipeline or classify_position_pairs after this to rebuild.

set search_path = public, extensions;

-- Truncate order: controversy_clusters first (CASCADE clears topic_controversies,
-- controversy_cluster_agreements, controversy_viewpoints), then agreement_clusters
-- (CASCADE clears agreement_cluster_positions, agreement_cluster_claims,
-- controversy_cluster_agreements, controversy_viewpoints, agreement_cluster_migrations),
-- then position_relationships, then agreement_summary_cache.
TRUNCATE controversy_clusters CASCADE;
TRUNCATE agreement_clusters CASCADE;
TRUNCATE position_relationships;
TRUNCATE agreement_summary_cache;
