-- Global color theme presets (light and dark stored independently).

CREATE TABLE public.theme_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('light', 'dark')),
  colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT theme_presets_name_nonempty CHECK (char_length(trim(name)) >= 1),
  CONSTRAINT theme_presets_name_len CHECK (char_length(name) <= 80),
  CONSTRAINT theme_presets_mode_name_unique UNIQUE (mode, name)
);

CREATE INDEX theme_presets_mode_idx ON public.theme_presets (mode);

COMMENT ON TABLE public.theme_presets IS
  'Named color themes for light or dark mode. Users pick one light and one dark preset independently.';

COMMENT ON COLUMN public.theme_presets.colors IS
  'Map of CSS custom property name → hex color, e.g. {"--background":"#ffffff"}.';

ALTER TABLE public.theme_presets ENABLE ROW LEVEL SECURITY;

-- Authenticated users can list themes (future user theme picker).
CREATE POLICY theme_presets_select_authenticated
  ON public.theme_presets
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin API uses service role for writes.
CREATE POLICY theme_presets_service
  ON public.theme_presets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
