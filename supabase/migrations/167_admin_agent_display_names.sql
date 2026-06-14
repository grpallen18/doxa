-- Admin-only display name overrides for pipeline agents (UI labels; step_id remains canonical).

CREATE TABLE public.admin_agent_display_names (
  step_id text PRIMARY KEY,
  display_name text NOT NULL CHECK (
    char_length(trim(display_name)) >= 1
    AND char_length(display_name) <= 120
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.admin_agent_display_names IS
  'Optional admin UI display names keyed by pipeline step_id. Does not affect deploy names or handlers.';

ALTER TABLE public.admin_agent_display_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_agent_display_names_service ON public.admin_agent_display_names
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
