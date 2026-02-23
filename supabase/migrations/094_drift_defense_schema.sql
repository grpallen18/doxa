-- Drift defense: label_ok, summary_ok, and centroid computation for position/controversy/viewpoint drift checks.
-- Centroid must be populated before build_controversy_clusters runs (pipeline order).

set search_path = public, extensions;

-- 1. position_clusters: add label_ok (true when drift check passes)
alter table public.position_clusters
  add column if not exists label_ok boolean not null default false;

comment on column public.position_clusters.label_ok is 'True when similarity(label+summary embedding, centroid_embedding) >= drift threshold. Used for drift defense.';

-- 2. controversy_viewpoints: add summary_ok (true when drift check passes)
alter table public.controversy_viewpoints
  add column if not exists summary_ok boolean not null default false;

comment on column public.controversy_viewpoints.summary_ok is 'True when similarity(summary embedding, position centroid) >= drift threshold. Used for drift defense.';

-- 3. RPC: compute_position_centroids
-- Computes l2_normalize(avg(embedding)) per position from position_cluster_claims + claims.
-- Run after upsert_position_clusters_batch, before build_controversy_clusters.
create or replace function public.compute_position_centroids()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  updated_count int;
begin
  with centroids as (
    select
      pcc.position_cluster_id,
      l2_normalize(avg(c.embedding)) as centroid
    from public.position_cluster_claims pcc
    join public.claims c on c.claim_id = pcc.claim_id and c.embedding is not null
    join public.position_clusters pc on pc.position_cluster_id = pcc.position_cluster_id
    where pc.status = 'active'
    group by pcc.position_cluster_id
    having count(*) >= 2
  )
  update public.position_clusters pc
  set centroid_embedding = c.centroid
  from centroids c
  where pc.position_cluster_id = c.position_cluster_id
    and c.centroid is not null;

  get diagnostics updated_count = row_count;

  return jsonb_build_object('updated_count', updated_count);
end;
$$;

comment on function public.compute_position_centroids() is 'Computes and stores centroid_embedding for active positions from member claim embeddings. Run after build_position_clusters, before build_controversy_clusters.';
