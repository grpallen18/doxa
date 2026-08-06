-- Cleanup: DROP legacy claims / SQL topology tables after Neo debate path cutover.
-- Preserves: stories, story_bodies, sources, auth, pipeline_runs, graph_processing_*, graph_*.

-- Health / topology RPCs that referenced dropped tables
drop function if exists public.match_agreement_clusters_nearest_in_topic(extensions.vector, uuid, int, float);
drop function if exists public.upsert_controversy_clusters_batch(jsonb);
drop function if exists public.refresh_claim_eligibility(uuid);
drop function if exists public.revert_chunk_claim_version(uuid);
drop function if exists public.revert_story_extraction_step(uuid, text, int);

-- Bridge / membership tables first (CASCADE covers most FKs)
drop table if exists public.story_claim_evidence_links cascade;
drop table if exists public.story_position_claim_links cascade;
drop table if exists public.story_position_claims cascade;
drop table if exists public.story_position_evidence_links cascade;
drop table if exists public.story_position_evidence cascade;
drop table if exists public.story_event_claim_links cascade;
drop table if exists public.story_event_claims cascade;
drop table if exists public.story_event_evidence_links cascade;
drop table if exists public.story_event_evidence cascade;
drop table if exists public.story_position_event_context cascade;

drop table if exists public.chunk_claim_versions cascade;
drop table if exists public.story_extraction_qa_artifacts cascade;
drop table if exists public.story_extraction_feedback cascade;

drop table if exists public.story_claims cascade;
drop table if exists public.story_positions cascade;
drop table if exists public.story_evidence cascade;
drop table if exists public.story_events cascade;
drop table if exists public.story_chunks cascade;
drop table if exists public.story_chunks_history cascade;

drop table if exists public.controversy_viewpoints cascade;
drop table if exists public.controversy_cluster_agreements cascade;
drop table if exists public.controversy_cluster_lineage cascade;
drop table if exists public.topic_controversies cascade;
drop table if exists public.controversy_clusters cascade;

drop table if exists public.agreement_cluster_relationships cascade;
drop table if exists public.agreement_cluster_pair_candidates cascade;
drop table if exists public.agreement_cluster_positions cascade;
drop table if exists public.agreement_cluster_claims cascade;
drop table if exists public.agreement_summary_cache cascade;
drop table if exists public.agreement_cluster_migrations cascade;
drop table if exists public.agreement_clusters cascade;

drop table if exists public.position_relationships cascade;
drop table if exists public.position_pair_candidates cascade;
drop table if exists public.position_pending_subtopics cascade;
drop table if exists public.pending_subtopics cascade;

drop table if exists public.claim_relationships cascade;
drop table if exists public.claims cascade;
drop table if exists public.claims_history cascade;
drop table if exists public.canonical_positions cascade;
drop table if exists public.positions_history cascade;
drop table if exists public.events cascade;
drop table if exists public.events_history cascade;

-- Optional legacy narrative tables
drop table if exists public.narrative_viewpoint_links cascade;
drop table if exists public.narratives cascade;
drop table if exists public.viewpoint_theses cascade;
drop table if exists public.viewpoints cascade;
drop table if exists public.claim_archetypes cascade;
drop table if exists public.archetypes cascade;
