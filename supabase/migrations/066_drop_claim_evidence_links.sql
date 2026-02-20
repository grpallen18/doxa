-- Drop claim_evidence_links: Phase 2 canonical evidence layer was never implemented.
-- Evidence remains story-local via story_claim_evidence_links; claim_evidence_links was unused.

drop table if exists public.claim_evidence_links cascade;
