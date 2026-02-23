-- One-time: clear controversies and viewpoints for fresh rebuild.
-- Positions remain. Run build_controversy_clusters (or clustering_pipeline) after this.

truncate table public.controversy_clusters cascade;
