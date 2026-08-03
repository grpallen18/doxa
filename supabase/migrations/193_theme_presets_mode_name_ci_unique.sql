-- Case-insensitive unique theme names within each mode (light/dark).
-- Same name may exist once in light and once in dark.

ALTER TABLE public.theme_presets
  DROP CONSTRAINT IF EXISTS theme_presets_mode_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS theme_presets_mode_name_ci_unique
  ON public.theme_presets (mode, lower(btrim(name)));
