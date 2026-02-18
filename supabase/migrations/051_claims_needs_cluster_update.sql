-- Add needs_cluster_update to claims for split refresh/classify scaling.
-- Set by refresh_claim_eligibility when vector search finds new pairs; cleared by classify_claim_pairs when processed.

alter table public.claims
  add column if not exists needs_cluster_update boolean not null default false;

comment on column public.claims.needs_cluster_update is 'Set by refresh_claim_eligibility when vector search finds new pairs; cleared by classify_claim_pairs when processed.';

create index if not exists idx_claims_needs_cluster_update
  on public.claims (needs_cluster_update)
  where needs_cluster_update = true;
