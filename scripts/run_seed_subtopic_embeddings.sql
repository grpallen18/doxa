-- One-time: Invoke seed_subtopic_embeddings Edge Function from SQL.
-- Run this in Supabase SQL Editor after migrations and function deployment.
-- Requires: pg_net extension, vault secrets (project_url, service_role_key).
-- The Edge Function will embed all subtopics via OpenAI and write to subtopics.embedding.

select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/seed_subtopic_embeddings',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
  ),
  body := '{}'::jsonb
) as request_id;
