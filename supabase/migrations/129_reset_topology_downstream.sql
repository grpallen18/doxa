-- Reset topology downstream for fresh pipeline run after 128_topology_pipeline_schema.

set search_path = public, extensions;

TRUNCATE controversy_viewpoints CASCADE;
TRUNCATE controversy_cluster_lineage CASCADE;
TRUNCATE controversy_cluster_agreements CASCADE;
TRUNCATE controversy_clusters CASCADE;
TRUNCATE agreement_cluster_relationships CASCADE;
TRUNCATE agreement_cluster_pair_candidates CASCADE;
TRUNCATE agreement_cluster_claims CASCADE;
TRUNCATE agreement_cluster_positions CASCADE;
TRUNCATE agreement_clusters CASCADE;
TRUNCATE position_relationships CASCADE;
TRUNCATE position_pair_candidates CASCADE;
TRUNCATE agreement_summary_cache;
