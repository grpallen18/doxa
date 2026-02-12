-- Add stance to story_claims: how the article frames the proposition (support/oppose/neutral).
-- Distinct from polarity (linguistic form: asserts/denies/uncertain). Enables viewpoint rollups.

alter table public.story_claims
  add column if not exists stance text;

alter table public.story_claims
  add constraint story_claims_stance_check
  check (stance is null or stance in ('support', 'oppose', 'neutral'));

comment on column public.story_claims.stance is 'How the article frames the proposition: support/oppose/neutral. Null until explicitly set at extraction. Existing rows stay null; backfill via separate edge function.';
