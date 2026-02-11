-- Thesis pipeline (Prompt 1 + 2): claims.thesis_clustered_at; theses centroid + drift columns.
-- Algorithm-created theses have centroid_embedding set; existing theses can leave it null.

alter table public.claims
  add column if not exists thesis_clustered_at timestamptz;

comment on column public.claims.thesis_clustered_at is 'Set when claim has been processed by claim_to_thesis; null means not yet clustered.';

alter table public.theses alter column topic_id drop not null;
alter table public.theses alter column archetype_id drop not null;
alter table public.theses alter column label drop not null;
alter table public.theses alter column summary drop not null;

alter table public.theses rename column embedding to thesis_text_embedding;

comment on column public.theses.thesis_text_embedding is 'Embedding of the LLM-generated thesis text; used for drift check vs centroid_embedding.';

alter table public.theses
  add column if not exists centroid_embedding vector(1536),
  add column if not exists claim_count int not null default 0,
  add column if not exists thesis_text text,
  add column if not exists thesis_text_ok boolean not null default false,
  add column if not exists last_text_ok_claim_count int not null default 0,
  add column if not exists last_text_written_at timestamptz,
  add column if not exists updated_at timestamptz default now();

comment on column public.theses.centroid_embedding is 'Normalized mean of linked claim embeddings; used for similarity match. Null for legacy theses.';
comment on column public.theses.claim_count is 'Number of claims linked to this thesis (for centroid and eligibility).';
comment on column public.theses.thesis_text is 'LLM-generated one-sentence label; written by thesis_drift_relabel.';
comment on column public.theses.thesis_text_ok is 'True when similarity(thesis_text_embedding, centroid_embedding) >= drift threshold at write time.';
comment on column public.theses.last_text_ok_claim_count is 'claim_count when thesis_text was last accepted (for min-new-claims-since-ok).';
comment on column public.theses.last_text_written_at is 'When thesis_text was last written (ok or not).';

create index if not exists idx_theses_centroid_embedding_hnsw
  on public.theses using hnsw (centroid_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where centroid_embedding is not null;
