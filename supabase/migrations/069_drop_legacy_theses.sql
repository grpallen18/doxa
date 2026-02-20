-- Drop legacy theses, thesis_claims, topic_theses and related functions.
-- Replaced by controversy-driven flow (topic_controversies, controversy_clusters) and viewpoint-driven Atlas.

-- 1. Drop functions that reference theses
drop function if exists public.get_thesis_claim_story_sources(uuid[]);
drop function if exists public.match_theses_nearest(text, int, float);
drop function if exists public.claim_to_thesis_run(int, boolean);

-- 2. Drop link tables and theses (order: dependents first)
drop table if exists public.topic_theses cascade;
drop table if exists public.thesis_claims cascade;
drop table if exists public.viewpoint_theses cascade;
drop table if exists public.theses cascade;
