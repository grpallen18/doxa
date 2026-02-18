-- RPC: upsert_position_pair_scores
-- Computes pair scores from claim_relationships + position_cluster_claims (active positions only).
-- Upserts into position_pair_scores, deletes obsolete pairs. Single transaction.

create or replace function public.upsert_position_pair_scores()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pairs_upserted int;
  pairs_deleted int;
  now_ts timestamptz := now();
  alpha constant numeric := 0.8;
begin
  -- Upsert computed pair scores (only active positions)
  with claim_to_pos as (
    select pcc.claim_id, pcc.position_cluster_id
    from public.position_cluster_claims pcc
    join public.position_clusters pc on pc.position_cluster_id = pcc.position_cluster_id
    where pc.status = 'active'
  ),
  pair_scores as (
    select
      least(cp_a.position_cluster_id, cp_b.position_cluster_id) as position_a_id,
      greatest(cp_a.position_cluster_id, cp_b.position_cluster_id) as position_b_id,
      count(*) filter (where cr.relationship = 'contradicts') as contradictory_count,
      count(*) filter (where cr.relationship = 'competing_framing') as competing_framing_count,
      count(*) filter (where cr.relationship = 'supports_same_position') as supporting_count
    from public.claim_relationships cr
    join claim_to_pos cp_a on cp_a.claim_id = cr.claim_a_id
    join claim_to_pos cp_b on cp_b.claim_id = cr.claim_b_id
    where cr.relationship in ('contradicts', 'competing_framing', 'supports_same_position')
      and cp_a.position_cluster_id != cp_b.position_cluster_id
    group by least(cp_a.position_cluster_id, cp_b.position_cluster_id),
             greatest(cp_a.position_cluster_id, cp_b.position_cluster_id)
  ),
  with_score as (
    select
      position_a_id,
      position_b_id,
      contradictory_count,
      competing_framing_count,
      supporting_count,
      contradictory_count::numeric + alpha * competing_framing_count::numeric as controversy_score
    from pair_scores
  )
  insert into public.position_pair_scores (
    position_a_id, position_b_id,
    contradictory_count, competing_framing_count, supporting_count,
    controversy_score, last_aggregated_at
  )
  select
    position_a_id, position_b_id,
    contradictory_count, competing_framing_count, supporting_count,
    controversy_score, now_ts
  from with_score
  on conflict (position_a_id, position_b_id) do update set
    contradictory_count = excluded.contradictory_count,
    competing_framing_count = excluded.competing_framing_count,
    supporting_count = excluded.supporting_count,
    controversy_score = excluded.controversy_score,
    last_aggregated_at = excluded.last_aggregated_at;

  get diagnostics pairs_upserted = row_count;

  -- Delete pairs that no longer have edges (both positions active but score would be 0)
  with current_pairs as (
    select pcc_a.position_cluster_id as pa, pcc_b.position_cluster_id as pb
    from public.claim_relationships cr
    join public.position_cluster_claims pcc_a on pcc_a.claim_id = cr.claim_a_id
    join public.position_cluster_claims pcc_b on pcc_b.claim_id = cr.claim_b_id
    join public.position_clusters pc_a on pc_a.position_cluster_id = pcc_a.position_cluster_id and pc_a.status = 'active'
    join public.position_clusters pc_b on pc_b.position_cluster_id = pcc_b.position_cluster_id and pc_b.status = 'active'
    where cr.relationship in ('contradicts', 'competing_framing', 'supports_same_position')
      and pcc_a.position_cluster_id != pcc_b.position_cluster_id
  ),
  kept as (
    select least(pa, pb) as position_a_id, greatest(pa, pb) as position_b_id
    from current_pairs
  )
  delete from public.position_pair_scores pps
  where not exists (
    select 1 from kept k
    where k.position_a_id = pps.position_a_id and k.position_b_id = pps.position_b_id
  );

  get diagnostics pairs_deleted = row_count;

  return jsonb_build_object('pairs_upserted', pairs_upserted, 'pairs_deleted', pairs_deleted);
end;
$$;

comment on function public.upsert_position_pair_scores() is 'Computes and upserts position pair scores from claim_relationships. Active positions only. Used by aggregate_position_pair_scores.';
