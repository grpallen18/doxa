-- Admin-managed OpenAI model IDs synced to Edge Function secrets.

CREATE TABLE public.admin_openai_model_config (
  config_key text PRIMARY KEY,
  model_value text NOT NULL CHECK (
    char_length(trim(model_value)) >= 1
    AND char_length(model_value) <= 120
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.admin_openai_model_config IS
  'Global OpenAI model IDs (OPENAI_MODEL*, OPENAI_EMBEDDING_MODEL). Pushed to Supabase Edge secrets on apply.';

ALTER TABLE public.admin_openai_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_openai_model_config_service ON public.admin_openai_model_config
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
