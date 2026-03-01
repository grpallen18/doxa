-- =============================================================================
-- Investigation: RFK Vaccine Controversy - Trace upstream to claim classifications
-- =============================================================================
-- Run these queries in Supabase SQL Editor to trace the RFK controversy
-- from viewpoints -> positions -> position_pair_scores -> claim_relationships.
--
-- HOW TO INTERPRET:
-- - controversy_score = contradictory_count + 0.8*competing_framing_count
-- - If the two viewpoints are same-side (e.g. both critics), the claim pairs
--   linking them were likely misclassified as contradicts/competing_framing
--   when they should be supports_same_position.
-- - Step 0d shows the actual claim texts so you can judge each classification.
--
-- Option A: Run Step 0a–0d (edit search pattern in target_controversy if needed).
-- Option B: Run steps 1–4 individually, replacing POS_A_UUID/POS_B_UUID after Step 1.
-- =============================================================================


-- =============================================================================
-- STEP 0: ALL-IN-ONE - Trace everything in one go
-- =============================================================================
-- Edit the search pattern in target_controversy if needed.
-- Run each block separately (they share the same CTEs conceptually but are separate queries).

-- 0a) Controversy + positions + viewpoints
WITH target_controversy AS (
  SELECT controversy_cluster_id
  FROM controversy_clusters
  WHERE status = 'active'
    AND (
      question ilike '%RFK%'
      OR question ilike '%Kennedy%vaccine%'
      OR question ilike '%vaccine%policy%Kennedy%'
      OR question ilike '%vaccine policies%Kennedy%'
      OR question ilike '%vaccine policies%Robert%Kennedy%'
      OR question ilike '%medical consensus%'
    )
  LIMIT 1
)
SELECT
  cc.controversy_cluster_id,
  cc.question,
  ccp.position_cluster_id,
  pc.label AS position_label,
  left(cv.summary, 200) AS viewpoint_preview
FROM controversy_clusters cc
JOIN controversy_cluster_positions ccp ON ccp.controversy_cluster_id = cc.controversy_cluster_id
JOIN position_clusters pc ON pc.position_cluster_id = ccp.position_cluster_id
LEFT JOIN controversy_viewpoints cv ON cv.controversy_cluster_id = cc.controversy_cluster_id
  AND cv.position_cluster_id = ccp.position_cluster_id
WHERE cc.controversy_cluster_id IN (SELECT controversy_cluster_id FROM target_controversy)
ORDER BY ccp.position_cluster_id;

-- 0b) Position pair scores (why these positions were linked)
WITH target_controversy AS (
  SELECT controversy_cluster_id FROM controversy_clusters
  WHERE status = 'active' AND (question ilike '%RFK%' OR question ilike '%Kennedy%vaccine%' OR question ilike '%vaccine%policy%')
  LIMIT 1
),
target_positions AS (
  SELECT ccp.position_cluster_id
  FROM controversy_cluster_positions ccp
  JOIN target_controversy tc ON tc.controversy_cluster_id = ccp.controversy_cluster_id
)
SELECT
  pa.label AS position_a_label,
  pb.label AS position_b_label,
  pps.contradictory_count,
  pps.competing_framing_count,
  pps.supporting_count,
  pps.controversy_score
FROM position_pair_scores pps
JOIN position_clusters pa ON pa.position_cluster_id = pps.position_a_id
JOIN position_clusters pb ON pb.position_cluster_id = pps.position_b_id
WHERE pps.position_a_id IN (SELECT position_cluster_id FROM target_positions)
  AND pps.position_b_id IN (SELECT position_cluster_id FROM target_positions);

-- 0c) Claim relationship breakdown (the classifications that drove controversy_score)
WITH target_controversy AS (
  SELECT controversy_cluster_id FROM controversy_clusters
  WHERE status = 'active' AND (question ilike '%RFK%' OR question ilike '%Kennedy%vaccine%' OR question ilike '%vaccine%policy%')
  LIMIT 1
),
target_positions AS (
  SELECT ccp.position_cluster_id
  FROM controversy_cluster_positions ccp
  JOIN target_controversy tc ON tc.controversy_cluster_id = ccp.controversy_cluster_id
),
pos_a_id AS (SELECT position_cluster_id FROM target_positions ORDER BY position_cluster_id LIMIT 1),
pos_b_id AS (SELECT position_cluster_id FROM target_positions ORDER BY position_cluster_id OFFSET 1 LIMIT 1),
pos_a_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id IN (SELECT position_cluster_id FROM pos_a_id)
),
pos_b_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id IN (SELECT position_cluster_id FROM pos_b_id)
)
SELECT cr.relationship, count(*) AS pair_count
FROM claim_relationships cr
WHERE (
  (cr.claim_a_id IN (SELECT claim_id FROM pos_a_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_b_claims))
  OR (cr.claim_a_id IN (SELECT claim_id FROM pos_b_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_a_claims))
)
GROUP BY cr.relationship
ORDER BY pair_count DESC;


-- =============================================================================
-- STEP 0d: Sample claim pairs with full text (for manual inspection)
-- =============================================================================
-- Run after Step 0. Uses same search pattern. Shows each claim pair and how
-- it was classified - so you can judge if contradicts/competing_framing was correct.
WITH target_controversy AS (
  SELECT controversy_cluster_id
  FROM controversy_clusters
  WHERE status = 'active'
    AND (question ilike '%RFK%' OR question ilike '%Kennedy%vaccine%' OR question ilike '%vaccine%policy%Kennedy%')
  LIMIT 1
),
target_positions AS (
  SELECT ccp.position_cluster_id
  FROM controversy_cluster_positions ccp
  JOIN target_controversy tc ON tc.controversy_cluster_id = ccp.controversy_cluster_id
),
pos_list AS (
  SELECT position_cluster_id, row_number() OVER (ORDER BY position_cluster_id) AS rn
  FROM target_positions
),
pos_a_id AS (SELECT position_cluster_id FROM pos_list WHERE rn = 1),
pos_b_id AS (SELECT position_cluster_id FROM pos_list WHERE rn = 2),
pos_a_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id IN (SELECT position_cluster_id FROM pos_a_id)
),
pos_b_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id IN (SELECT position_cluster_id FROM pos_b_id)
)
SELECT
  cr.relationship,
  cr.similarity_at_classification,
  left(c_a.canonical_text, 300) AS claim_a_text,
  left(c_b.canonical_text, 300) AS claim_b_text
FROM claim_relationships cr
JOIN claims c_a ON c_a.claim_id = cr.claim_a_id
JOIN claims c_b ON c_b.claim_id = cr.claim_b_id
WHERE (
  cr.claim_a_id IN (SELECT claim_id FROM pos_a_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_b_claims)
) OR (
  cr.claim_a_id IN (SELECT claim_id FROM pos_b_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_a_claims)
)
ORDER BY
  CASE cr.relationship
    WHEN 'contradicts' THEN 1
    WHEN 'competing_framing' THEN 2
    WHEN 'supports_same_position' THEN 3
    ELSE 4
  END,
  cr.classified_at DESC
LIMIT 20;


-- =============================================================================
-- INDIVIDUAL STEPS (if all-in-one doesn't work or you need more control)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Find the controversy and its positions
-- -----------------------------------------------------------------------------
SELECT
  cc.controversy_cluster_id,
  cc.question,
  ccp.position_cluster_id,
  pc.label AS position_label,
  left(cv.summary, 150) AS viewpoint_summary_preview
FROM controversy_clusters cc
JOIN controversy_cluster_positions ccp ON ccp.controversy_cluster_id = cc.controversy_cluster_id
JOIN position_clusters pc ON pc.position_cluster_id = ccp.position_cluster_id
LEFT JOIN controversy_viewpoints cv ON cv.controversy_cluster_id = cc.controversy_cluster_id
  AND cv.position_cluster_id = ccp.position_cluster_id
WHERE cc.status = 'active'
  AND (cc.question ilike '%RFK%' OR cc.question ilike '%Kennedy%vaccine%' OR cc.question ilike '%vaccine%policy%')
ORDER BY cc.controversy_cluster_id, ccp.position_cluster_id;


-- -----------------------------------------------------------------------------
-- STEP 2: Position pair scores (replace UUIDs from Step 1)
-- -----------------------------------------------------------------------------
SELECT
  pa.label AS position_a_label,
  pb.label AS position_b_label,
  pps.contradictory_count,
  pps.competing_framing_count,
  pps.supporting_count,
  pps.controversy_score
FROM position_pair_scores pps
JOIN position_clusters pa ON pa.position_cluster_id = pps.position_a_id
JOIN position_clusters pb ON pb.position_cluster_id = pps.position_b_id
WHERE (pps.position_a_id = 'POS_A_UUID'::uuid AND pps.position_b_id = 'POS_B_UUID'::uuid)
   OR (pps.position_a_id = 'POS_B_UUID'::uuid AND pps.position_b_id = 'POS_A_UUID'::uuid);


-- -----------------------------------------------------------------------------
-- STEP 3: Relationship breakdown (replace UUIDs)
-- -----------------------------------------------------------------------------
WITH pos_a_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id = 'POS_A_UUID'::uuid
),
pos_b_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id = 'POS_B_UUID'::uuid
)
SELECT cr.relationship, count(*) AS pair_count
FROM claim_relationships cr
WHERE (
  (cr.claim_a_id IN (SELECT claim_id FROM pos_a_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_b_claims))
  OR (cr.claim_a_id IN (SELECT claim_id FROM pos_b_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_a_claims))
)
GROUP BY cr.relationship
ORDER BY pair_count DESC;


-- -----------------------------------------------------------------------------
-- STEP 4: Full claim pairs with text (replace UUIDs)
-- -----------------------------------------------------------------------------
WITH pos_a_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id = 'POS_A_UUID'::uuid
),
pos_b_claims AS (
  SELECT claim_id FROM position_cluster_claims WHERE position_cluster_id = 'POS_B_UUID'::uuid
)
SELECT
  cr.relationship,
  left(c_a.canonical_text, 250) AS claim_a_text,
  left(c_b.canonical_text, 250) AS claim_b_text
FROM claim_relationships cr
JOIN claims c_a ON c_a.claim_id = cr.claim_a_id
JOIN claims c_b ON c_b.claim_id = cr.claim_b_id
WHERE (
  (cr.claim_a_id IN (SELECT claim_id FROM pos_a_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_b_claims))
  OR (cr.claim_a_id IN (SELECT claim_id FROM pos_b_claims) AND cr.claim_b_id IN (SELECT claim_id FROM pos_a_claims))
)
ORDER BY cr.relationship, cr.classified_at DESC;
