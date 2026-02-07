-- story_chunks: add extraction_json for chunk-level LLM output.
-- claims: add HNSW index for cosine nearest-neighbor search.
-- story_claims: add optional embedding column for debugging.

alter table public.story_chunks add column if not exists extraction_json jsonb;

comment on column public.story_chunks.extraction_json is 'Chunk-level extraction: { claims, evidence, links }. Populated by extract_chunk_claims Edge Function.';

create index if not exists idx_claims_embedding_hnsw
  on public.claims using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.story_claims add column if not exists embedding vector(1536);

comment on column public.story_claims.embedding is 'Optional embedding for debugging; canonical embeddings on claims.';
