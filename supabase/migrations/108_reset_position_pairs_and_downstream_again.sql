-- Reset position pairs and downstream again (for fresh pairing run with gpt-4o).
-- Run classify_position_pairs or clustering_pipeline after to rebuild.

set search_path = public, extensions;

TRUNCATE controversy_clusters CASCADE;
TRUNCATE agreement_clusters CASCADE;
TRUNCATE position_relationships;
TRUNCATE agreement_summary_cache;
