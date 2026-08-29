-- L3: "reviewed, nothing to change" is a terminal proposal outcome.
-- Without it an empty-ops proposal fails validation as "no ops", which returns the
-- queue item to pending and re-reviews the same dossier on every cron tick.

ALTER TABLE public.l3_proposals DROP CONSTRAINT IF EXISTS l3_proposals_status_check;
ALTER TABLE public.l3_proposals
  ADD CONSTRAINT l3_proposals_status_check
  CHECK (status IN (
    'submitted', 'pending_approval', 'validated', 'rejected',
    'applied', 'partially_applied', 'reverted', 'no_op'
  ));
