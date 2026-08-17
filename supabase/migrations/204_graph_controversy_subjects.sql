-- Arena/CQ projections: person/topic browse index, ranking, chapters.

ALTER TABLE public.graph_controversies
  ADD COLUMN IF NOT EXISTS ranking_score double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arena_uid text,
  ADD COLUMN IF NOT EXISTS chapter_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chapter_of text;

CREATE INDEX IF NOT EXISTS graph_controversies_ranking_score_idx
  ON public.graph_controversies (ranking_score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.graph_controversy_subjects (
  controversy_uid text NOT NULL REFERENCES public.graph_controversies (uid) ON DELETE CASCADE,
  entity_uid text NOT NULL,
  name text,
  kind_hint text,
  weight double precision NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'subject',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (controversy_uid, entity_uid)
);

CREATE INDEX IF NOT EXISTS graph_controversy_subjects_entity_idx
  ON public.graph_controversy_subjects (entity_uid, weight DESC);

ALTER TABLE public.graph_controversy_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS graph_controversy_subjects_public_select ON public.graph_controversy_subjects;
CREATE POLICY graph_controversy_subjects_public_select
  ON public.graph_controversy_subjects FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.graph_entity_alias_candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  left_uid text NOT NULL,
  right_uid text NOT NULL,
  score double precision,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (left_uid, right_uid)
);

ALTER TABLE public.graph_entity_alias_candidates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.graph_controversy_subjects IS
  'Browse index: Entity SUBJECT_OF Controversy (person/topic hubs). Not controversy identity.';
COMMENT ON TABLE public.graph_entity_alias_candidates IS
  'Quarantine queue for near-duplicate Entities; no silent merge.';
