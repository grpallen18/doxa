-- RPC for nearest-neighbor search on claim_clusters.centroid_embedding (cosine distance).
-- Used by future topic/consumer code to find relevant controversy clusters.

create or replace function public.match_clusters_nearest(
  query_embedding text,
  match_count int default 50,
  min_similarity float default 0.60
)
returns table (cluster_id uuid, distance float, similarity float)
language sql stable
security definer
set search_path = public
as $$
  select
    c.cluster_id,
    (c.centroid_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (c.centroid_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.claim_clusters c
  where c.centroid_embedding is not null
    and (1.0 - (c.centroid_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by c.centroid_embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_clusters_nearest(text, int, float) is 'Find claim clusters whose centroid_embedding is similar to query; returns cluster_id, distance, similarity. For future topic/consumer use.';
