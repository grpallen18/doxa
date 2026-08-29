-- Shared xAI MCP connector authenticates as bot_id `grok` (one Bearer token).

ALTER TABLE public.l3_bots DROP CONSTRAINT IF EXISTS l3_bots_kind_check;
ALTER TABLE public.l3_bots
  ADD CONSTRAINT l3_bots_kind_check
  CHECK (kind IN (
    'curator', 'editor', 'auditor', 'acquisition', 'admin',
    'provenance', 'lead-reviewer', 'grok'
  ));
