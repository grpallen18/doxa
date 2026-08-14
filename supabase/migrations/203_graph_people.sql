-- Consumer people profiles: Neo Entity(kindHint=person) projections.
-- Neo remains write authority; UI reads graph_people.

CREATE TABLE IF NOT EXISTS public.graph_people (
  uid text PRIMARY KEY,
  name text NOT NULL,
  normalized_name text,
  offices jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  publishers jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  controversies jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_propositions jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_people jsonb NOT NULL DEFAULT '[]'::jsonb,
  pulse jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributed_remarks jsonb NOT NULL DEFAULT '[]'::jsonb,
  eidos jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.graph_people IS
  'Projected person profiles (Entity kindHint=person) for /people/{uid}.';
COMMENT ON COLUMN public.graph_people.stats IS
  'JSON: coverage_30d, coverage_prior_30d, delta_pct, fire_rating, claim_count, debate_count, mention_count.';
COMMENT ON COLUMN public.graph_people.eidos IS
  'JSON ego graph snapshot {nodes:[{id,label,kind,size}], edges:[{source,target}]} for /people/{uid}/eidos.';

CREATE INDEX IF NOT EXISTS graph_people_normalized_name_idx
  ON public.graph_people (normalized_name);
CREATE INDEX IF NOT EXISTS graph_people_name_lower_idx
  ON public.graph_people (lower(name));
CREATE INDEX IF NOT EXISTS graph_people_updated_at_idx
  ON public.graph_people (updated_at DESC);

ALTER TABLE public.graph_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY graph_people_public_select
  ON public.graph_people FOR SELECT TO anon, authenticated USING (true);
