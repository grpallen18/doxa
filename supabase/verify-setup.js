// Verification script to test Supabase database setup
// Run with: node supabase/verify-setup.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gjxihyaovyfwajjyoyoz.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S';

async function verifySetup() {
  console.log('🔍 Verifying Supabase database setup...\n');
  console.log('URL:', SUPABASE_URL);
  console.log('');

  const checks = [];
  let allPassed = true;

  // Check 1: Perspectives table
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/perspectives?select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.length >= 3) {
        console.log('✅ Perspectives table: OK (found', data.length, 'perspectives)');
        checks.push({ name: 'Perspectives', status: 'pass', count: data.length });
      } else {
        console.log('⚠️  Perspectives table: Found but only', data.length, 'entries (expected 3+)');
        checks.push({ name: 'Perspectives', status: 'warning', count: data.length });
      }
    } else if (response.status === 404) {
      console.log('❌ Perspectives table: NOT FOUND - Migration may not have run');
      checks.push({ name: 'Perspectives', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Perspectives table: Error', response.status);
      checks.push({ name: 'Perspectives', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Perspectives table: Connection error -', error.message);
    checks.push({ name: 'Perspectives', status: 'fail' });
    allPassed = false;
  }

  // Check 2: Nodes table
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/nodes?select=id,question,status&limit=10`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.length >= 5) {
        console.log('✅ Nodes table: OK (found', data.length, 'nodes)');
        checks.push({ name: 'Nodes', status: 'pass', count: data.length });
      } else {
        console.log('⚠️  Nodes table: Found but only', data.length, 'entries (expected 5+)');
        checks.push({ name: 'Nodes', status: 'warning', count: data.length });
      }
    } else if (response.status === 404) {
      console.log('❌ Nodes table: NOT FOUND - Migration may not have run');
      checks.push({ name: 'Nodes', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Nodes table: Error', response.status);
      checks.push({ name: 'Nodes', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Nodes table: Connection error -', error.message);
    checks.push({ name: 'Nodes', status: 'fail' });
    allPassed = false;
  }

  // Check 3: Node Perspectives
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/node_perspectives?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      console.log('✅ Node Perspectives table: OK');
      checks.push({ name: 'Node Perspectives', status: 'pass' });
    } else if (response.status === 404) {
      console.log('❌ Node Perspectives table: NOT FOUND');
      checks.push({ name: 'Node Perspectives', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Node Perspectives table: Error', response.status);
      checks.push({ name: 'Node Perspectives', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Node Perspectives table: Connection error -', error.message);
    checks.push({ name: 'Node Perspectives', status: 'fail' });
    allPassed = false;
  }

  // Check 4: Node Relationships
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/node_relationships?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      console.log('✅ Node Relationships table: OK');
      checks.push({ name: 'Node Relationships', status: 'pass' });
    } else if (response.status === 404) {
      console.log('❌ Node Relationships table: NOT FOUND');
      checks.push({ name: 'Node Relationships', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Node Relationships table: Error', response.status);
      checks.push({ name: 'Node Relationships', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Node Relationships table: Connection error -', error.message);
    checks.push({ name: 'Node Relationships', status: 'fail' });
    allPassed = false;
  }

  // Check 5: Sources
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/sources?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      console.log('✅ Sources table: OK');
      checks.push({ name: 'Sources', status: 'pass' });
    } else if (response.status === 404) {
      console.log('❌ Sources table: NOT FOUND');
      checks.push({ name: 'Sources', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Sources table: Error', response.status);
      checks.push({ name: 'Sources', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Sources table: Connection error -', error.message);
    checks.push({ name: 'Sources', status: 'fail' });
    allPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log('='.repeat(50));
  
  checks.forEach(check => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
    const count = check.count ? ` (${check.count} entries)` : '';
    console.log(`${icon} ${check.name}${count}`);
  });

  console.log('');
  if (allPassed) {
    console.log('🎉 All checks passed! Database setup is complete.');
    console.log('\nNext steps:');
    console.log('  1. Verify data in Supabase Table Editor');
    console.log('  2. Proceed with API endpoint development');
  } else {
    console.log('⚠️  Some checks failed. Please review the errors above.');
    console.log('\nTroubleshooting:');
    console.log('  1. Make sure you ran the migration SQL in Supabase SQL Editor');
    console.log('  2. Make sure you ran the seed SQL to populate data');
    console.log('  3. Check RLS policies if tables exist but return 401/403 errors');
  }
}

verifySetup().catch(console.error);
