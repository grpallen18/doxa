/**
 * Query controversy_viewpoints where title contains "Bad Bunny"
 * Run: node scripts/bad-bunny-viewpoints.js
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

const TRUNCATE_LEN = 120;

function truncate(s) {
  if (!s || typeof s !== 'string') return '(none)';
  return s.length <= TRUNCATE_LEN ? s : s.slice(0, TRUNCATE_LEN) + '...';
}

async function main() {
  console.log('=== Bad Bunny Viewpoints Report ===\n');

  // 1. All controversy_viewpoints where title contains "Bad Bunny"
  const { data: viewpoints, error: vpErr } = await supabase
    .from('controversy_viewpoints')
    .select('viewpoint_id, controversy_cluster_id, position_cluster_id, title, summary')
    .ilike('title', '%Bad Bunny%');

  if (vpErr) {
    console.error('Error fetching viewpoints:', vpErr.message);
    process.exit(1);
  }

  if (!viewpoints?.length) {
    console.log('No viewpoints found with title containing "Bad Bunny".');
    return;
  }

  console.log('1. VIEWPOINTS WITH "BAD BUNNY" IN TITLE');
  console.log('   Found', viewpoints.length, 'viewpoint(s)\n');
  for (const v of viewpoints) {
    console.log('   viewpoint_id:', v.viewpoint_id);
    console.log('   controversy_cluster_id:', v.controversy_cluster_id);
    console.log('   position_cluster_id:', v.position_cluster_id);
    console.log('   title:', v.title || '(none)');
    console.log('   summary:', truncate(v.summary));
    console.log('');
  }

  const controversyIds = [...new Set(viewpoints.map(v => v.controversy_cluster_id))];

  // 2. Get controversy questions
  const { data: controversies, error: ccErr } = await supabase
    .from('controversy_clusters')
    .select('controversy_cluster_id, question')
    .in('controversy_cluster_id', controversyIds);

  if (ccErr) {
    console.error('Error fetching controversies:', ccErr.message);
    process.exit(1);
  }

  const controversyMap = {};
  (controversies || []).forEach(c => { controversyMap[c.controversy_cluster_id] = c; });

  console.log('2. CONTROVERSY QUESTIONS');
  for (const ccId of controversyIds) {
    const c = controversyMap[ccId];
    console.log('   [' + ccId + ']');
    console.log('   question:', c?.question || '(not found)');
    console.log('');
  }

  // 3. Count total viewpoints per controversy
  const { data: allViewpoints, error: allVpErr } = await supabase
    .from('controversy_viewpoints')
    .select('controversy_cluster_id')
    .in('controversy_cluster_id', controversyIds);

  if (allVpErr) {
    console.error('Error counting viewpoints:', allVpErr.message);
    process.exit(1);
  }

  const viewpointCountByControversy = {};
  (allViewpoints || []).forEach(v => {
    viewpointCountByControversy[v.controversy_cluster_id] =
      (viewpointCountByControversy[v.controversy_cluster_id] || 0) + 1;
  });

  console.log('3. TOTAL VIEWPOINT COUNT PER CONTROVERSY');
  for (const ccId of controversyIds) {
    const count = viewpointCountByControversy[ccId] || 0;
    console.log('   [' + ccId + ']:', count, 'viewpoint(s)');
  }
  console.log('');

  // 4. For each controversy: list all positions from controversy_cluster_positions and whether each has a viewpoint
  const viewpointPositions = new Set(
    viewpoints.map(v => `${v.controversy_cluster_id}|${v.position_cluster_id}`)
  );

  const { data: ccpRows, error: ccpErr } = await supabase
    .from('controversy_cluster_positions')
    .select('controversy_cluster_id, position_cluster_id, side, stance_label')
    .in('controversy_cluster_id', controversyIds);

  if (ccpErr) {
    console.error('Error fetching controversy_cluster_positions:', ccpErr.message);
    process.exit(1);
  }

  const positionIds = [...new Set((ccpRows || []).map(r => r.position_cluster_id))];
  const { data: posDetails } = await supabase
    .from('position_clusters')
    .select('position_cluster_id, label')
    .in('position_cluster_id', positionIds);
  const posMap = {};
  (posDetails || []).forEach(p => { posMap[p.position_cluster_id] = p; });

  console.log('4. POSITIONS PER CONTROVERSY (from controversy_cluster_positions)');
  for (const ccId of controversyIds) {
    const positions = (ccpRows || []).filter(r => r.controversy_cluster_id === ccId);
    console.log('   Controversy:', ccId);
    console.log('   Question:', truncate(controversyMap[ccId]?.question));
    console.log('   Positions:');
    for (const p of positions) {
      const hasViewpoint = viewpointPositions.has(`${ccId}|${p.position_cluster_id}`);
      const label = posMap[p.position_cluster_id]?.label || '(no label)';
      console.log('      -', p.position_cluster_id, '| side:', p.side, '| stance:', p.stance_label || '(none)');
      console.log('        label:', label);
      console.log('        has_viewpoint:', hasViewpoint ? 'YES' : 'NO');
    }
    console.log('');
  }

  console.log('=== End of Report ===');
}

main().catch(console.error);
