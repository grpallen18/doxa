-- Display metadata for admin OpenAI model config (friendly label + description).

ALTER TABLE public.admin_openai_model_config
  ADD COLUMN IF NOT EXISTS display_label text
    CHECK (
      display_label IS NULL
      OR (
        char_length(trim(display_label)) >= 1
        AND char_length(display_label) <= 120
      )
    ),
  ADD COLUMN IF NOT EXISTS display_description text
    CHECK (
      display_description IS NULL
      OR (
        char_length(trim(display_description)) >= 1
        AND char_length(display_description) <= 500
      )
    );

COMMENT ON COLUMN public.admin_openai_model_config.display_label IS
  'Optional admin-facing friendly name; falls back to catalog label when null.';

COMMENT ON COLUMN public.admin_openai_model_config.display_description IS
  'Optional admin-facing description; falls back to catalog description when null.';
