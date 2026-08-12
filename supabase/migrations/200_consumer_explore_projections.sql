-- Consumer explore: richer debate projections, topic links, public read, saves/critiques/polls.

-- ── Enrich graph_controversies ──────────────────────────────────────────────
ALTER TABLE public.graph_controversies
  ADD COLUMN IF NOT EXISTS question text,
  ADD COLUMN IF NOT EXISTS source_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shared_bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clash_bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dispute_bullets jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.graph_controversies.question IS
  'Neutral debate question for consumer UI; falls back to title when null.';

-- ── Enrich graph_viewpoints ─────────────────────────────────────────────────
ALTER TABLE public.graph_viewpoints
  ADD COLUMN IF NOT EXISTS thesis text,
  ADD COLUMN IF NOT EXISTS sample_propositions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS grounding_summary text;

COMMENT ON COLUMN public.graph_viewpoints.sample_propositions IS
  'JSON array of {uid, text} sample propositions for progressive disclosure.';

-- ── Evidence excerpts (quotes for EvidenceSheet) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.graph_evidence_excerpts (
  id bigserial PRIMARY KEY,
  controversy_uid text NOT NULL REFERENCES public.graph_controversies (uid) ON DELETE CASCADE,
  proposition_uid text NOT NULL,
  proposition_text text,
  utterance_uid text,
  speaker_name text,
  document_uid text,
  excerpt text,
  publication_name text,
  story_title text,
  story_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_evidence_excerpts_controversy_uid_idx
  ON public.graph_evidence_excerpts (controversy_uid);
CREATE INDEX IF NOT EXISTS graph_evidence_excerpts_proposition_uid_idx
  ON public.graph_evidence_excerpts (proposition_uid);

ALTER TABLE public.graph_evidence_excerpts ENABLE ROW LEVEL SECURITY;

-- ── Topic ↔ controversy links (replaces fuzzy topic_key ILIKE) ──────────────
CREATE TABLE IF NOT EXISTS public.graph_topic_links (
  topic_id uuid NOT NULL REFERENCES public.topics (topic_id) ON DELETE CASCADE,
  controversy_uid text NOT NULL REFERENCES public.graph_controversies (uid) ON DELETE CASCADE,
  link_method text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, controversy_uid)
);

CREATE INDEX IF NOT EXISTS graph_topic_links_controversy_uid_idx
  ON public.graph_topic_links (controversy_uid);

ALTER TABLE public.graph_topic_links ENABLE ROW LEVEL SECURITY;

-- ── User saves ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_saved_controversies (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  controversy_uid text NOT NULL REFERENCES public.graph_controversies (uid) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, controversy_uid)
);

ALTER TABLE public.user_saved_controversies ENABLE ROW LEVEL SECURITY;

-- ── Structured critiques ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_critiques (
  critique_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('controversy', 'viewpoint', 'proposition')),
  target_uid text NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'missing_fact',
    'bad_representation',
    'weak_support',
    'other'
  )),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_critiques_target_idx
  ON public.user_critiques (target_kind, target_uid);

ALTER TABLE public.user_critiques ENABLE ROW LEVEL SECURITY;

-- ── Polls (P3) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.explore_polls (
  poll_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('controversy', 'viewpoint', 'proposition')),
  target_uid text NOT NULL,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.explore_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.explore_polls (poll_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('agree', 'disagree', 'unsure')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

ALTER TABLE public.explore_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.explore_poll_votes ENABLE ROW LEVEL SECURITY;

-- ── Public SELECT on projections (anon + authenticated) ─────────────────────
DROP POLICY IF EXISTS graph_controversies_authenticated_select ON public.graph_controversies;
DROP POLICY IF EXISTS graph_viewpoints_authenticated_select ON public.graph_viewpoints;
DROP POLICY IF EXISTS graph_controversy_evidence_authenticated_select ON public.graph_controversy_evidence;

CREATE POLICY graph_controversies_public_select
  ON public.graph_controversies FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY graph_viewpoints_public_select
  ON public.graph_viewpoints FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY graph_controversy_evidence_public_select
  ON public.graph_controversy_evidence FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY graph_evidence_excerpts_public_select
  ON public.graph_evidence_excerpts FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY graph_topic_links_public_select
  ON public.graph_topic_links FOR SELECT TO anon, authenticated USING (true);

-- Assessments already authenticated-only in 196; open for public explore.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'graph_assessments' AND policyname = 'graph_assessments_authenticated_select'
  ) THEN
    EXECUTE 'DROP POLICY graph_assessments_authenticated_select ON public.graph_assessments';
  END IF;
END $$;

CREATE POLICY graph_assessments_public_select
  ON public.graph_assessments FOR SELECT TO anon, authenticated USING (true);

-- Saves / critiques / poll votes: own rows only
CREATE POLICY user_saved_controversies_select_own
  ON public.user_saved_controversies FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY user_saved_controversies_insert_own
  ON public.user_saved_controversies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_saved_controversies_delete_own
  ON public.user_saved_controversies FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_critiques_select_own
  ON public.user_critiques FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY user_critiques_insert_own
  ON public.user_critiques FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY explore_polls_public_select
  ON public.explore_polls FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY explore_poll_votes_select_authenticated
  ON public.explore_poll_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY explore_poll_votes_upsert_own
  ON public.explore_poll_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY explore_poll_votes_update_own
  ON public.explore_poll_votes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-link controversies to topics when topic_key matches slug or name (case-insensitive).
CREATE OR REPLACE FUNCTION public.link_graph_controversies_to_topics()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked integer := 0;
BEGIN
  INSERT INTO public.graph_topic_links (topic_id, controversy_uid, link_method)
  SELECT t.topic_id, c.uid, 'auto'
  FROM public.graph_controversies c
  INNER JOIN public.topics t
    ON c.topic_key IS NOT NULL
   AND length(trim(c.topic_key)) > 0
   AND c.topic_key NOT LIKE 'sim:%'
   AND c.topic_key <> 'general'
   AND (
     lower(t.slug) = lower(c.topic_key)
     OR lower(coalesce(t.name, '')) = lower(c.topic_key)
     OR lower(t.title) = lower(c.topic_key)
   )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS linked = ROW_COUNT;
  RETURN linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_graph_controversies_to_topics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_graph_controversies_to_topics() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_graph_controversies_to_topics() TO service_role;
