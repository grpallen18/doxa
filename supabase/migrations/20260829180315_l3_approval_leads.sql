-- L3 Slack approval, lead requests, and expanded bot kinds.

ALTER TABLE public.l3_proposals DROP CONSTRAINT IF EXISTS l3_proposals_status_check;
ALTER TABLE public.l3_proposals
  ADD CONSTRAINT l3_proposals_status_check
  CHECK (status IN (
    'submitted', 'pending_approval', 'validated', 'rejected',
    'applied', 'partially_applied', 'reverted'
  ));

ALTER TABLE public.l3_proposals DROP CONSTRAINT IF EXISTS l3_proposals_kind_check;
ALTER TABLE public.l3_proposals
  ADD CONSTRAINT l3_proposals_kind_check
  CHECK (kind IN (
    'membership', 'viewpoint', 'audit', 'mint', 'consolidate',
    'source_lead', 'lead_candidate'
  ));

ALTER TABLE public.l3_bots DROP CONSTRAINT IF EXISTS l3_bots_kind_check;
ALTER TABLE public.l3_bots
  ADD CONSTRAINT l3_bots_kind_check
  CHECK (kind IN (
    'curator', 'editor', 'auditor', 'acquisition', 'admin',
    'provenance', 'lead-reviewer'
  ));

ALTER TABLE public.l3_review_queue DROP CONSTRAINT IF EXISTS l3_review_queue_kind_check;
ALTER TABLE public.l3_review_queue
  ADD CONSTRAINT l3_review_queue_kind_check
  CHECK (kind IN (
    'membership', 'viewpoint', 'audit', 'mint', 'consolidate', 'lead_candidate'
  ));

CREATE TABLE IF NOT EXISTS public.l3_approval_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_uid text NOT NULL REFERENCES public.l3_proposals (proposal_uid) ON DELETE CASCADE,
  slack_channel text,
  slack_thread_ts text,
  approver_slack_user text,
  verdict text NOT NULL CHECK (verdict IN ('approve', 'reject')),
  reason text,
  payload_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l3_approval_decisions_proposal_idx
  ON public.l3_approval_decisions (proposal_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS public.l3_slack_threads (
  proposal_uid text PRIMARY KEY REFERENCES public.l3_proposals (proposal_uid) ON DELETE CASCADE,
  slack_channel text NOT NULL,
  slack_thread_ts text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l3_slack_threads_ts_idx
  ON public.l3_slack_threads (slack_thread_ts);

CREATE TABLE IF NOT EXISTS public.lead_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_uid text NOT NULL,
  expected_counter_thesis text,
  priority integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'claimed', 'fulfilled', 'cancelled')),
  claimed_by_bot text,
  claimed_until timestamptz,
  created_by text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_requests_state_idx
  ON public.lead_requests (state, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS lead_requests_question_idx
  ON public.lead_requests (question_uid);

ALTER TABLE public.l3_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_slack_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_lead_request(
  p_bot_id text,
  p_limit integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 3600
)
RETURNS TABLE (
  request_id uuid,
  question_uid text,
  expected_counter_thesis text,
  priority integer,
  payload jsonb,
  claimed_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp timestamptz := now() + make_interval(secs => GREATEST(60, p_lease_seconds));
BEGIN
  UPDATE public.lead_requests r
  SET state = 'pending',
      claimed_by_bot = NULL,
      claimed_until = NULL,
      updated_at = now()
  WHERE r.state = 'claimed'
    AND r.claimed_until < now();

  RETURN QUERY
  WITH picked AS (
    SELECT r.request_id
    FROM public.lead_requests r
    WHERE r.state = 'pending'
    ORDER BY r.priority DESC, r.created_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 5))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.lead_requests r
  SET state = 'claimed',
      claimed_by_bot = p_bot_id,
      claimed_until = v_exp,
      updated_at = now()
  FROM picked
  WHERE r.request_id = picked.request_id
  RETURNING
    r.request_id,
    r.question_uid,
    r.expected_counter_thesis,
    r.priority,
    r.payload,
    r.claimed_until;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_lead_request(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lead_request(text, integer, integer) TO service_role;
