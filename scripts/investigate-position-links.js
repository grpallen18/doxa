/**
 * Investigation script: Why is "Washington Post Layoffs" linked to Epstein-related controversies?
 * Run: node scripts/investigate-position-links.js
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

async function main() {
  console.log('=== Investigating "Washington Post Layoffs" position links ===\n');

  // 1. Find the position
  const { data: positions, error: posErr } = await supabase
    .from('position_clusters')
    .select('position_cluster_id, label, summary, status')
    .ilike('label', '%Washington Post Layoffs%')
    .eq('status', 'active');

  if (posErr) {
    console.error('Error fetching position:', posErr.message);
    return;
  }

  if (!positions?.length) {
    console.log('No position found with label containing "Washington Post Layoffs"');
    console.log('Trying broader search...');
    const { data: allPos } = await supabase
      .from('position_clusters')
      .select('position_cluster_id, label')
      .eq('status', 'active')
      .limit(200);
    const match = (allPos || []).find(p => (p.label || '').toLowerCase().includes('washington post'));
    if (match) {
      console.log('Found:', match.label, '(', match.position_cluster_id, ')');
      positions.push(match);
    } else {
      console.log('Positions sample:', (allPos || []).slice(0, 5).map(p => p.label));
      return;
    }
  }

  const pos = positions[0];
  const posId = pos.position_cluster_id;
  console.log('1. POSITION FOUND');
  console.log('   ID:', posId);
  console.log('   Label:', pos.label);
  console.log('   Summary:', (pos.summary || '').slice(0, 200) + '...');
  console.log('');

  // 2. Get linked controversies
  const { data: ccpRows, error: ccpErr } = await supabase
    .from('controversy_cluster_positions')
    .select('controversy_cluster_id, side, stance_label')
    .eq('position_cluster_id', posId);

  if (ccpErr) {
    console.error('Error fetching controversies:', ccpErr.message);
    return;
  }

  const controversyIds = (ccpRows || []).map(r => r.controversy_cluster_id);
  console.log('2. LINKED CONTROVERSIES (' + controversyIds.length + ')');
  for (const r of ccpRows || []) {
    console.log('   -', r.controversy_cluster_id, '| side:', r.side, '| stance:', r.stance_label);
  }
  console.log('');

  if (controversyIds.length === 0) {
    console.log('No controversies linked. Nothing to investigate.');
    return;
  }

  // 3. Get controversy details (questions)
  const { data: controversies, error: ccErr } = await supabase
    .from('controversy_clusters')
    .select('controversy_cluster_id, question, label, status')
    .in('controversy_cluster_id', controversyIds);

  if (ccErr) {
    console.error('Error fetching controversy details:', ccErr.message);
    return;
  }

  console.log('3. CONTROVERSY QUESTIONS');
  for (const c of controversies || []) {
    console.log('   [' + c.controversy_cluster_id + ']');
    console.log('   Q:', c.question);
    console.log('');
  }

  // 4. Get OTHER positions in these controversies (the "opposing" positions)
  const { data: otherPosRows } = await supabase
    .from('controversy_cluster_positions')
    .select('controversy_cluster_id, position_cluster_id, side, stance_label')
    .in('controversy_cluster_id', controversyIds)
    .neq('position_cluster_id', posId);

  const otherPosIds = [...new Set((otherPosRows || []).map(r => r.position_cluster_id))];
  console.log('4. OPPOSING POSITIONS IN THESE CONTROVERSIES');
  const { data: otherPosDetails } = await supabase
    .from('position_clusters')
    .select('position_cluster_id, label, summary')
    .in('position_cluster_id', otherPosIds);

  for (const p of otherPosDetails || []) {
    const links = (otherPosRows || []).filter(r => r.position_cluster_id === p.position_cluster_id);
    console.log('   -', p.label, '| ID:', p.position_cluster_id);
    console.log('     Summary:', (p.summary || '').slice(0, 150) + '...');
    console.log('     In controversies:', links.map(l => l.controversy_cluster_id).join(', '));
    console.log('');
  }

  // 5. Get position_pair_scores (the aggregation that caused the link)
  console.log('5. POSITION PAIR SCORES (what triggered the controversy links)');
  for (const otherId of otherPosIds) {
    const [a, b] = [posId, otherId].sort();
    const { data: scoreRow } = await supabase
      .from('position_pair_scores')
      .select('contradictory_count, competing_framing_count, supporting_count, controversy_score')
      .eq('position_a_id', a)
      .eq('position_b_id', b)
      .single();

    if (scoreRow) {
      const otherLabel = (otherPosDetails || []).find(p => p.position_cluster_id === otherId)?.label || otherId;
      console.log('   Washington Post Layoffs <->', otherLabel);
      console.log('     contradictory_count:', scoreRow.contradictory_count);
      console.log('     competing_framing_count:', scoreRow.competing_framing_count);
      console.log('     supporting_count:', scoreRow.supporting_count);
      console.log('     controversy_score:', scoreRow.controversy_score);
      console.log('');
    }
  }

  // 6. Trace to claim_relationships - the actual claim pairs that caused this
  console.log('6. CLAIM RELATIONSHIPS (the specific claim pairs that linked these positions)');
  const { data: wpClaims } = await supabase
    .from('position_cluster_claims')
    .select('claim_id')
    .eq('position_cluster_id', posId);
  const wpClaimIds = (wpClaims || []).map(r => r.claim_id);

  if (wpClaimIds.length === 0) {
    console.log('   No claims in Washington Post Layoffs position!');
    return;
  }

  // Get other position's claim IDs
  const { data: otherClaims } = await supabase
    .from('position_cluster_claims')
    .select('claim_id, position_cluster_id')
    .in('position_cluster_id', otherPosIds);
  const otherClaimIds = new Set((otherClaims || []).map(r => r.claim_id));

  // Fetch claim_relationships in batches (Supabase or() has URL length limits)
  // We need rows where (claim_a in wp AND claim_b in other) OR (claim_b in wp AND claim_a in other)
  let crossRels = [];
  const batchSize = 20;
  for (let i = 0; i < wpClaimIds.length; i += batchSize) {
    const batch = wpClaimIds.slice(i, i + batchSize);
    const orParts = batch.flatMap(id => [`claim_a_id.eq.${id}`, `claim_b_id.eq.${id}`]);
    const { data: relRows } = await supabase
      .from('claim_relationships')
      .select('claim_a_id, claim_b_id, relationship, classified_at')
      .or(orParts.join(','));
    const filtered = (relRows || []).filter(r => {
      const wpHasA = wpClaimIds.includes(r.claim_a_id);
      const wpHasB = wpClaimIds.includes(r.claim_b_id);
      const otherHasA = otherClaimIds.has(r.claim_a_id);
      const otherHasB = otherClaimIds.has(r.claim_b_id);
      return ((wpHasA && otherHasB) || (wpHasB && otherHasA)) &&
        (r.relationship === 'contradicts' || r.relationship === 'competing_framing');
    });
    crossRels = crossRels.concat(filtered);
  }

  console.log('   Found', crossRels.length, 'contradictory/competing_framing relationships between WP claims and Epstein-position claims');
  console.log('');

  // Get claim text for these
  const allClaimIds = new Set();
  crossRels.forEach(r => { allClaimIds.add(r.claim_a_id); allClaimIds.add(r.claim_b_id); });
  const { data: claimRows } = await supabase
    .from('claims')
    .select('claim_id, canonical_text')
    .in('claim_id', Array.from(allClaimIds));

  const claimMap = {};
  (claimRows || []).forEach(c => { claimMap[c.claim_id] = c.canonical_text; });

  console.log('   SAMPLE RELATIONSHIPS (first 5):');
  for (const r of crossRels.slice(0, 5)) {
    const textA = claimMap[r.claim_a_id] || '(no text)';
    const textB = claimMap[r.claim_b_id] || '(no text)';
    const wpText = wpClaimIds.includes(r.claim_a_id) ? textA : textB;
    const epText = wpClaimIds.includes(r.claim_a_id) ? textB : textA;
    console.log('   ---');
    console.log('   Relationship:', r.relationship);
    console.log('   Washington Post Layoffs claim:', wpText?.slice(0, 200));
    console.log('   Epstein-position claim:', epText?.slice(0, 200));
    console.log('');
  }

  // 7. Summary
  console.log('=== SUMMARY ===');
  console.log('The position "Washington Post Layoffs" is linked to Epstein controversies because:');
  console.log('1. The pipeline found', crossRels.length, 'claim_relationships where a claim in "Washington Post Layoffs"');
  console.log('   was classified as contradicting or competing_framing with a claim in an Epstein-related position.');
  console.log('2. position_pair_scores aggregates these into controversy_score between position pairs.');
  console.log('3. build_controversy_clusters creates a controversy for any pair with controversy_score >= 1.');
  console.log('4. This creates the link even if the connection seems semantically wrong.');
  console.log('');
  console.log('Possible causes:');
  console.log('- LLM misclassification: classify_claim_pairs may have incorrectly labeled unrelated claims as contradictory/competing.');
  console.log('- Shared stories: If a story covered both topics, claims could be spuriously linked.');
  console.log('- Overly broad clustering: position_clusters may have grouped unrelated claims under "Washington Post Layoffs".');
}

main().catch(console.error);
