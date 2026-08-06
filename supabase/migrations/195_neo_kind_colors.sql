-- Global Neo graph node-kind colors (singleton admin setting).

CREATE TABLE public.neo_kind_colors (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.neo_kind_colors IS
  'Singleton row of Neo explorer node-kind hex colors shared by all admins.';

COMMENT ON COLUMN public.neo_kind_colors.colors IS
  'Map of NeoNodeKind → #RRGGBB, e.g. {"document":"#2d5a4a"}.';

INSERT INTO public.neo_kind_colors (id, colors)
VALUES ('default', '{}'::jsonb);

ALTER TABLE public.neo_kind_colors ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (admin Neo explorer).
CREATE POLICY neo_kind_colors_select_authenticated
  ON public.neo_kind_colors
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin API uses service role for writes.
CREATE POLICY neo_kind_colors_service
  ON public.neo_kind_colors
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
