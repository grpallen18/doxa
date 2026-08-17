-- Controversy time chapters: open/closed status for feed filtering.

ALTER TABLE public.graph_controversies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS superseded_by text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graph_controversies_status_check'
  ) THEN
    ALTER TABLE public.graph_controversies
      ADD CONSTRAINT graph_controversies_status_check
      CHECK (status IN ('open', 'closed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS graph_controversies_status_ranking_idx
  ON public.graph_controversies (status, ranking_score DESC);

COMMENT ON COLUMN public.graph_controversies.status IS
  'open = current chapter in feeds; closed = retained historical chapter (chapterOf target).';
COMMENT ON COLUMN public.graph_controversies.superseded_by IS
  'When status=closed, uid of the successor chapter Controversy.';
COMMENT ON COLUMN public.graph_controversies.closed_at IS
  'When the chapter was closed by a time-chapter fork.';
