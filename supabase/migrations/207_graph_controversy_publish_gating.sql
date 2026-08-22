-- Publish gating: developing status, block reason, open-only public RLS.

ALTER TABLE public.graph_controversies
  ADD COLUMN IF NOT EXISTS publish_block_reason text;

ALTER TABLE public.graph_controversies
  DROP CONSTRAINT IF EXISTS graph_controversies_status_check;

ALTER TABLE public.graph_controversies
  ADD CONSTRAINT graph_controversies_status_check
  CHECK (status IN ('open', 'closed', 'developing'));

COMMENT ON COLUMN public.graph_controversies.status IS
  'open = consumer-visible; developing = established in Neo but not publishable; closed = historical chapter.';
COMMENT ON COLUMN public.graph_controversies.publish_block_reason IS
  'Why status=developing: insufficient_sides | no_sources | no_viewpoints.';

-- Backfill empty debates off the public feed until projection re-runs.
UPDATE public.graph_controversies
SET
  status = 'developing',
  publish_block_reason = CASE
    WHEN sides_count < 2 THEN 'insufficient_sides'
    WHEN source_count < 1 THEN 'no_sources'
    ELSE 'no_viewpoints'
  END,
  ranking_score = 0
WHERE status = 'open'
  AND (
    sides_count < 2
    OR source_count < 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.graph_viewpoints v
      WHERE v.controversy_uid = graph_controversies.uid
    )
  );

CREATE INDEX IF NOT EXISTS graph_controversies_status_updated_idx
  ON public.graph_controversies (status, updated_at DESC);

-- ── Public SELECT: open controversies only ───────────────────────────────────
DROP POLICY IF EXISTS graph_controversies_public_select ON public.graph_controversies;
CREATE POLICY graph_controversies_public_select
  ON public.graph_controversies FOR SELECT TO anon, authenticated
  USING (status = 'open');

DROP POLICY IF EXISTS graph_viewpoints_public_select ON public.graph_viewpoints;
CREATE POLICY graph_viewpoints_public_select
  ON public.graph_viewpoints FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.graph_controversies c
      WHERE c.uid = controversy_uid AND c.status = 'open'
    )
  );

DROP POLICY IF EXISTS graph_controversy_evidence_public_select ON public.graph_controversy_evidence;
CREATE POLICY graph_controversy_evidence_public_select
  ON public.graph_controversy_evidence FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.graph_controversies c
      WHERE c.uid = controversy_uid AND c.status = 'open'
    )
  );

DROP POLICY IF EXISTS graph_evidence_excerpts_public_select ON public.graph_evidence_excerpts;
CREATE POLICY graph_evidence_excerpts_public_select
  ON public.graph_evidence_excerpts FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.graph_controversies c
      WHERE c.uid = controversy_uid AND c.status = 'open'
    )
  );

DROP POLICY IF EXISTS graph_topic_links_public_select ON public.graph_topic_links;
CREATE POLICY graph_topic_links_public_select
  ON public.graph_topic_links FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.graph_controversies c
      WHERE c.uid = controversy_uid AND c.status = 'open'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'graph_controversy_subjects'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS graph_controversy_subjects_public_select ON public.graph_controversy_subjects';
    EXECUTE $policy$
      CREATE POLICY graph_controversy_subjects_public_select
        ON public.graph_controversy_subjects FOR SELECT TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.graph_controversies c
            WHERE c.uid = controversy_uid AND c.status = 'open'
          )
        )
    $policy$;
  END IF;
END $$;
