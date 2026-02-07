-- RPC for nearest-neighbor search on claims.embedding (cosine distance).
-- Used by link_canonical_claims Edge Function.

create or replace function public.match_claims_nearest(
  query_embedding text,
  match_count int default 1
)
returns table (claim_id uuid, distance float)
language sql stable
as $$
  select c.claim_id, (c.embedding <=> query_embedding::vector)::float as distance
  from public.claims c
  where c.embedding is not null
  order by c.embedding <=> query_embedding::vector
  limit match_count;
$$;
