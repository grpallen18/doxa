-- Phase 3 L4 Assessments projected from Neo (not extracted facts).
-- Admin graph-controversies "Analyzed" section reads this table.

CREATE TABLE IF NOT EXISTS public.graph_assessments (
  uid text PRIMARY KEY,
  target_kind text NOT NULL,
  target_uid text NOT NULL,
  kind text,
  summary text,
  confidence double precision,
  method_run_uid text,
  layer text NOT NULL DEFAULT 'analyzed' CHECK (layer = 'analyzed'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_assessments_target_idx
  ON public.graph_assessments (target_kind, target_uid);

COMMENT ON TABLE public.graph_assessments IS
  'Model-derived L4 assessments projected from Neo. Never present as extracted facts.';

ALTER TABLE public.graph_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY graph_assessments_authenticated_select
  ON public.graph_assessments
  FOR SELECT
  TO authenticated
  USING (true);
