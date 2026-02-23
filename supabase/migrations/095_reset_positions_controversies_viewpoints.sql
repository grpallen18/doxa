-- One-time reset: clear positions, controversies, viewpoints for clean rebuild with drift checks.
-- Pipeline will rebuild from claim_relationships. Run clustering_pipeline after this.

truncate table public.controversy_clusters cascade;
truncate table public.position_clusters cascade;
truncate table public.position_summary_cache;
