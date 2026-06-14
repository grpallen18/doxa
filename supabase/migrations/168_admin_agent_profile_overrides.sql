-- Extend admin agent profile overrides with job title and bio.

ALTER TABLE public.admin_agent_display_names
  ALTER COLUMN display_name DROP NOT NULL;

ALTER TABLE public.admin_agent_display_names
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.admin_agent_display_names
  DROP CONSTRAINT IF EXISTS admin_agent_display_names_display_name_check;

ALTER TABLE public.admin_agent_display_names
  ADD CONSTRAINT admin_agent_display_names_display_name_check CHECK (
    display_name IS NULL
    OR (
      char_length(trim(display_name)) >= 1
      AND char_length(display_name) <= 120
    )
  );

ALTER TABLE public.admin_agent_display_names
  ADD CONSTRAINT admin_agent_display_names_job_title_check CHECK (
    job_title IS NULL
    OR (
      char_length(trim(job_title)) >= 1
      AND char_length(job_title) <= 120
    )
  );

ALTER TABLE public.admin_agent_display_names
  ADD CONSTRAINT admin_agent_display_names_bio_check CHECK (
    bio IS NULL
    OR (
      char_length(trim(bio)) >= 1
      AND char_length(bio) <= 500
    )
  );

COMMENT ON TABLE public.admin_agent_display_names IS
  'Optional admin UI overrides for agent profile fields keyed by pipeline step_id.';

COMMENT ON COLUMN public.admin_agent_display_names.job_title IS
  'Optional override for the agent profile job title.';

COMMENT ON COLUMN public.admin_agent_display_names.bio IS
  'Optional override for the agent profile short description.';
