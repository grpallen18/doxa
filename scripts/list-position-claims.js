/**
 * List every claim linked to "Washington Post Layoffs" position.
 * Run: node scripts/list-position-claims.js
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
  const { data: positions } = await supabase
    .from('position_clusters')
    .select('position_cluster_id, label')
    .ilike('label', '%Washington Post Layoffs%')
    .eq('status', 'active');

  if (!positions?.length) {
    console.log('Position not found.');
    return;
  }

  const posId = positions[0].position_cluster_id;
  console.log('Position:', positions[0].label, '| ID:', posId);
  console.log('');

  const { data: pcc } = await supabase
    .from('position_cluster_claims')
    .select('claim_id, role')
    .eq('position_cluster_id', posId)
    .order('role', { ascending: true });

  const claimIds = (pcc || []).map(r => r.claim_id);
  if (claimIds.length === 0) {
    console.log('No claims in this position.');
    return;
  }

  const { data: claims } = await supabase
    .from('claims')
    .select('claim_id, canonical_text')
    .in('claim_id', claimIds);

  const claimMap = {};
  (claims || []).forEach(c => { claimMap[c.claim_id] = c.canonical_text; });

  const roleMap = {};
  (pcc || []).forEach(r => { roleMap[r.claim_id] = r.role; });

  console.log('Total claims:', claimIds.length);
  console.log('---');
  claimIds.forEach((id, i) => {
    const text = claimMap[id] || '(no text)';
    const role = roleMap[id] || '—';
    console.log(`\n${i + 1}. [${role}] ${id}`);
    console.log(text);
  });
}

main().catch(console.error);
