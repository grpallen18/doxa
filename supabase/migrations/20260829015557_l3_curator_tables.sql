-- L3 curator: review queue, proposals, runs, question projection, bot tokens.

CREATE TABLE IF NOT EXISTS public.graph_questions (
  uid text PRIMARY KEY,
  question text,
  question_type text,
  exclusivity text,
  status text NOT NULL DEFAULT 'developing'
    CHECK (status IN ('developing', 'established', 'closed')),
  member_count integer NOT NULL DEFAULT 0,
  candidate_count integer NOT NULL DEFAULT 0,
  speaker_count integer NOT NULL DEFAULT 0,
  publication_count integer NOT NULL DEFAULT 0,
  controversy_uid text,
  blocking_key text,
  last_reviewed_at timestamptz,
  expected_counter_thesis text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_questions_status_idx ON public.graph_questions (status);
CREATE INDEX IF NOT EXISTS graph_questions_blocking_key_idx ON public.graph_questions (blocking_key);

CREATE TABLE IF NOT EXISTS public.l3_bots (
  bot_id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'curator'
    CHECK (kind IN ('curator', 'editor', 'auditor', 'acquisition', 'admin')),
  token_hash text NOT NULL UNIQUE,
  rate_limit_per_min integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.l3_review_queue (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('membership', 'viewpoint', 'audit', 'mint', 'consolidate')),
  question_uid text,
  controversy_uid text,
  cluster_id text,
  priority double precision NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'leased', 'proposed', 'applied', 'blocked', 'done')),
  lease_id uuid,
  leased_by text,
  lease_expires_at timestamptz,
  dirty_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l3_review_queue_state_kind_idx
  ON public.l3_review_queue (state, kind, priority DESC);
CREATE INDEX IF NOT EXISTS l3_review_queue_question_idx
  ON public.l3_review_queue (question_uid);

CREATE TABLE IF NOT EXISTS public.l3_proposals (
  proposal_uid text PRIMARY KEY,
  bot_id text,
  kind text NOT NULL
    CHECK (kind IN ('membership', 'viewpoint', 'audit', 'mint', 'consolidate', 'source_lead')),
  question_uid text,
  controversy_uid text,
  lease_id uuid,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'submitted', 'validated', 'rejected', 'applied', 'partially_applied', 'reverted'
    )),
  validator_errors jsonb,
  auto_apply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l3_proposals_status_idx ON public.l3_proposals (status, kind);
CREATE INDEX IF NOT EXISTS l3_proposals_question_idx ON public.l3_proposals (question_uid);

CREATE TABLE IF NOT EXISTS public.l3_proposal_ops (
  id bigserial PRIMARY KEY,
  proposal_uid text NOT NULL REFERENCES public.l3_proposals (proposal_uid) ON DELETE CASCADE,
  op_index integer NOT NULL,
  op_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'accepted', 'rejected', 'applied', 'reverted')),
  validator_errors jsonb,
  gold_negative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_uid, op_index)
);

CREATE TABLE IF NOT EXISTS public.l3_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id text,
  kind text,
  lease_id uuid,
  items integer NOT NULL DEFAULT 0,
  ops_submitted integer NOT NULL DEFAULT 0,
  ops_applied integer NOT NULL DEFAULT 0,
  ops_rejected integer NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  wall_ms integer NOT NULL DEFAULT 0,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.l3_gold_negatives (
  id bigserial PRIMARY KEY,
  question_uid text,
  prop_uid text,
  op_type text,
  reason text,
  proposal_uid text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.l3_mcp_audit (
  id bigserial PRIMARY KEY,
  bot_id text,
  tool text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l3_mcp_audit_created_idx ON public.l3_mcp_audit (created_at DESC);

ALTER TABLE public.graph_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_proposal_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_gold_negatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l3_mcp_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY graph_questions_authenticated_select
  ON public.graph_questions FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.claim_l3_review_batch(
  p_bot_id text,
  p_kind text,
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 900
)
RETURNS TABLE (
  item_id uuid,
  kind text,
  question_uid text,
  controversy_uid text,
  cluster_id text,
  priority double precision,
  dirty_reason text,
  payload jsonb,
  lease_id uuid,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease uuid := gen_random_uuid();
  v_exp timestamptz := now() + make_interval(secs => GREATEST(60, p_lease_seconds));
BEGIN
  UPDATE public.l3_review_queue q
  SET state = 'pending',
      lease_id = NULL,
      leased_by = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE q.state = 'leased'
    AND q.lease_expires_at < now();

  RETURN QUERY
  WITH picked AS (
    SELECT q.item_id
    FROM public.l3_review_queue q
    WHERE q.state = 'pending'
      AND q.kind = p_kind
    ORDER BY q.priority DESC, q.enqueued_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 20))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.l3_review_queue q
  SET state = 'leased',
      lease_id = v_lease,
      leased_by = p_bot_id,
      lease_expires_at = v_exp,
      updated_at = now()
  FROM picked
  WHERE q.item_id = picked.item_id
  RETURNING
    q.item_id,
    q.kind,
    q.question_uid,
    q.controversy_uid,
    q.cluster_id,
    q.priority,
    q.dirty_reason,
    q.payload,
    q.lease_id,
    q.lease_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_l3_review_batch(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_l3_review_batch(text, text, integer, integer) TO service_role;
