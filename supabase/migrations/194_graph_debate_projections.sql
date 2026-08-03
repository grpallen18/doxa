-- Neo4j Phase 2 debate projections (not legacy controversy_clusters SoT).
-- UI reads these for Admin graph-controversies; Neo remains write authority.

CREATE TABLE IF NOT EXISTS public.graph_controversies (
  uid text PRIMARY KEY,
  title text,
  summary text,
  sides_count integer NOT NULL DEFAULT 0,
  topic_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.graph_viewpoints (
  uid text PRIMARY KEY,
  controversy_uid text REFERENCES public.graph_controversies (uid) ON DELETE SET NULL,
  label text,
  summary text,
  topic_key text,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_viewpoints_controversy_uid_idx
  ON public.graph_viewpoints (controversy_uid);

CREATE TABLE IF NOT EXISTS public.graph_controversy_evidence (
  controversy_uid text NOT NULL REFERENCES public.graph_controversies (uid) ON DELETE CASCADE,
  document_uid text NOT NULL,
  utterance_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (controversy_uid, document_uid)
);

CREATE INDEX IF NOT EXISTS graph_controversy_evidence_document_uid_idx
  ON public.graph_controversy_evidence (document_uid);

ALTER TABLE public.graph_controversies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_viewpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_controversy_evidence ENABLE ROW LEVEL SECURITY;

-- Admin/API uses service role; authenticated users may read projections.
CREATE POLICY graph_controversies_authenticated_select
  ON public.graph_controversies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY graph_viewpoints_authenticated_select
  ON public.graph_viewpoints
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY graph_controversy_evidence_authenticated_select
  ON public.graph_controversy_evidence
  FOR SELECT
  TO authenticated
  USING (true);
