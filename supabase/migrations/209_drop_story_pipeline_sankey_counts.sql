-- Observability Sankey was removed; drop the unused snapshot RPC.

drop function if exists public.get_story_pipeline_sankey_counts();
