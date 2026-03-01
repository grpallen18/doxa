/**
 * Run RFK controversy investigation - traces upstream to claim classifications.
 * Run: node scripts/run-rfk-investigation.js
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SEARCH_PATTERNS = ['%RFK%', '%Kennedy%vaccine%', '%vaccine%policy%Kennedy%', '%vaccine policies%Robert%Kennedy%', '%medical consensus%'];

async function main() {
  console.log('=== RFK Vaccine Controversy Investigation ===\n');

  // 1. Find the controversy
  let controversy = null;
  for (const pattern of SEARCH_PATTERNS) {
    const { data, error } = await supabase
      .from('controversy_clusters')
      .select('controversy_cluster_id, question, summary')
      .eq('status', 'active')
      .ilike('question', pattern)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Error finding controversy:', error.message);
      return;
    }
    if (data) {
      controversy = data;
      break;
    }
  }

  if (!controversy) {
    console.log('No controversy found matching RFK/vaccine patterns.');
    console.log('Trying broader search...');
    const { data: all } = await supabase
      .from('controversy_clusters')
      .select('controversy_cluster_id, question')
      .eq('status', 'active')
      .limit(50);
    const match = (all || []).find((c) =>
      (c.question || '').toLowerCase().includes('kennedy') || (c.question || '').toLowerCase().includes('rfk')
    );
    if (match) {
      controversy = { controversy_cluster_id: match.controversy_cluster_id, question: match.question, summary: null };
    }
  }

  if (!controversy) {
    console.log('No RFK-related controversy found in database.');
    return;
  }

  const ccId = controversy.controversy_cluster_id;
  console.log('1. CONTROVERSY FOUND');
  console.log('   ID:', ccId);
  console.log('   Question:', controversy.question);
  console.log('');

  // 2. Get positions and viewpoints
  const { data: ccpRows, error: ccpErr } = await supabase
    .from('controversy_cluster_positions')
    .select('position_cluster_id, stance_label')
    .eq('controversy_cluster_id', ccId);

  if (ccpErr || !ccpRows?.length) {
    console.log('No positions linked to this controversy.');
    return;
  }

  const posIds = ccpRows.map((r) => r.position_cluster_id);
  const { data: posDetails } = await supabase
    .from('position_clusters')
    .select('position_cluster_id, label, summary')
    .in('position_cluster_id', posIds);

  const { data: viewpoints } = await supabase
    .from('controversy_viewpoints')
    .select('position_cluster_id, title, summary')
    .eq('controversy_cluster_id', ccId);

  console.log('2. POSITIONS & VIEWPOINTS');
  for (const p of posDetails || []) {
    const vp = (viewpoints || []).find((v) => v.position_cluster_id === p.position_cluster_id);
    console.log('   Position:', p.label);
    console.log('   ID:', p.position_cluster_id);
    console.log('   Viewpoint:', vp?.title || '(none)');
    console.log('   Summary:', (vp?.summary || p.summary || '').slice(0, 150) + '...');
    console.log('');
  }

  // 3. Position pair scores
  const sortedPosIds = [...posIds].sort();
  let pps = null;
  if (sortedPosIds.length >= 2) {
    const { data } = await supabase
      .from('position_pair_scores')
      .select('position_a_id, position_b_id, contradictory_count, competing_framing_count, supporting_count, controversy_score')
      .eq('position_a_id', sortedPosIds[0])
      .eq('position_b_id', sortedPosIds[1])
      .maybeSingle();
    pps = data;
  }

  console.log('3. POSITION PAIR SCORES (why these positions were linked)');
  if (pps) {
    const pa = (posDetails || []).find((p) => p.position_cluster_id === pps.position_a_id);
    const pb = (posDetails || []).find((p) => p.position_cluster_id === pps.position_b_id);
    console.log('   ', pa?.label || pps.position_a_id, '<->', pb?.label || pps.position_b_id);
    console.log('   contradictory_count:', pps.contradictory_count);
    console.log('   competing_framing_count:', pps.competing_framing_count);
    console.log('   supporting_count:', pps.supporting_count);
    console.log('   controversy_score:', pps.controversy_score);
  } else {
    console.log('   No pair score found (positions may have been linked via topic expansion).');
  }
  console.log('');

  // 4. Claim relationships between the two positions
  const posA = sortedPosIds[0];
  const posB = sortedPosIds[1];

  const { data: claimsA } = await supabase.from('position_cluster_claims').select('claim_id').eq('position_cluster_id', posA);
  const { data: claimsB } = await supabase.from('position_cluster_claims').select('claim_id').eq('position_cluster_id', posB);

  const claimIdsA = (claimsA || []).map((r) => r.claim_id);
  const claimIdsB = (claimsB || []).map((r) => r.claim_id);

  // Fetch claim_relationships - pairs where (a in A, b in B) or (a in B, b in A)
  const rels = [];
  // Batch to avoid URL length limits
  const batchSize = 30;
  for (let i = 0; i < claimIdsA.length; i += batchSize) {
    const batchA = claimIdsA.slice(i, i + batchSize);
    const { data: r1 } = await supabase
      .from('claim_relationships')
      .select('claim_a_id, claim_b_id, relationship, similarity_at_classification, classified_at')
      .in('claim_a_id', batchA)
      .in('claim_b_id', claimIdsB);
    for (const r of r1 || []) rels.push(r);
  }
  for (let i = 0; i < claimIdsB.length; i += batchSize) {
    const batchB = claimIdsB.slice(i, i + batchSize);
    const { data: r2 } = await supabase
      .from('claim_relationships')
      .select('claim_a_id, claim_b_id, relationship, similarity_at_classification, classified_at')
      .in('claim_a_id', batchB)
      .in('claim_b_id', claimIdsA);
    for (const r of r2 || []) rels.push(r);
  }

  const relByType = {};
  for (const r of rels) {
    relByType[r.relationship] = (relByType[r.relationship] || 0) + 1;
  }

  console.log('4. CLAIM RELATIONSHIP BREAKDOWN (classifications between the two positions)');
  for (const [rel, count] of Object.entries(relByType).sort((a, b) => b[1] - a[1])) {
    console.log('   ', rel + ':', count);
  }
  if (Object.keys(relByType).length === 0) {
    console.log('   No direct claim_relationships between these positions.');
    console.log('   (They may have been grouped via topic expansion in build_controversy_clusters)');
  }
  console.log('');

  // 5. Sample claim pairs with text
  const claimIds = [...new Set(rels.flatMap((r) => [r.claim_a_id, r.claim_b_id]))];
  const { data: claimRows } = await supabase.from('claims').select('claim_id, canonical_text').in('claim_id', claimIds);
  const claimMap = new Map((claimRows || []).map((c) => [c.claim_id, c.canonical_text]));

  console.log('5. SAMPLE CLAIM PAIRS (first 5)');
  const order = ['contradicts', 'competing_framing', 'supports_same_position', 'orthogonal'];
  const sortedRels = [...rels].sort((a, b) => {
    const ia = order.indexOf(a.relationship);
    const ib = order.indexOf(b.relationship);
    if (ia !== ib) return ia - ib;
    return new Date(b.classified_at) - new Date(a.classified_at);
  });

  for (const r of sortedRels.slice(0, 5)) {
    const textA = claimMap.get(r.claim_a_id) || '(no text)';
    const textB = claimMap.get(r.claim_b_id) || '(no text)';
    console.log('   ---');
    console.log('   Relationship:', r.relationship);
    console.log('   Claim A:', textA.slice(0, 200) + (textA.length > 200 ? '...' : ''));
    console.log('   Claim B:', textB.slice(0, 200) + (textB.length > 200 ? '...' : ''));
    console.log('');
  }

  console.log('=== DONE ===');
}

main().catch(console.error);
