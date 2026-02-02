// Verification script for Supabase database (target schema: after migrations 010 and 011)
// Run with: node supabase/verify-setup.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gjxihyaovyfwajjyoyoz.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function verifySetup() {
  console.log('🔍 Verifying Supabase database setup (target schema: topics, viewpoints, ...)\n');
  console.log('URL:', SUPABASE_URL);
  console.log('');

  const checks = [];
  let allPassed = true;

  // Check 1: Topics table (topic_id, slug, title, summary, status)
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/topics?select=topic_id,slug,title,status&limit=10`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.length >= 1) {
        console.log('✅ Topics table: OK (found', data.length, 'topics)');
        checks.push({ name: 'Topics', status: 'pass', count: data.length });
      } else {
        console.log('⚠️  Topics table: Found but no rows (run seed_new_schema.sql)');
        checks.push({ name: 'Topics', status: 'warning', count: data.length });
      }
    } else if (response.status === 404) {
      console.log('❌ Topics table: NOT FOUND - Run migrations 010 and 011');
      checks.push({ name: 'Topics', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Topics table: Error', response.status);
      checks.push({ name: 'Topics', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Topics table: Connection error -', error.message);
    checks.push({ name: 'Topics', status: 'fail' });
    allPassed = false;
  }

  // Check 2: Viewpoints table (topic-scoped: viewpoint_id, topic_id, title, summary)
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/viewpoints?select=viewpoint_id,topic_id,title&limit=10`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Viewpoints table: OK (found', data.length, 'viewpoints)');
      checks.push({ name: 'Viewpoints', status: 'pass', count: data.length });
    } else if (response.status === 404) {
      console.log('❌ Viewpoints table: NOT FOUND - Run migration 011');
      checks.push({ name: 'Viewpoints', status: 'fail' });
      allPassed = false;
    } else {
      console.log('❌ Viewpoints table: Error', response.status);
      checks.push({ name: 'Viewpoints', status: 'fail' });
      allPassed = false;
    }
  } catch (error) {
    console.log('❌ Viewpoints table: Connection error -', error.message);
    checks.push({ name: 'Viewpoints', status: 'fail' });
    allPassed = false;
  }

  // Check 3: Sources table (publisher shape: source_id, name, domain)
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/sources?select=source_id,name,domain&limit=1`, {
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
    const count = check.count !== undefined ? ` (${check.count} entries)` : '';
    console.log(`${icon} ${check.name}${count}`);
  });

  console.log('');
  if (allPassed) {
    console.log('🎉 All checks passed! Database setup is complete.');
    console.log('\nNext steps:');
    console.log('  1. Verify data in Supabase Table Editor');
    console.log('  2. Run the app with npm run dev');
  } else {
    console.log('⚠️  Some checks failed. Please review the errors above.');
    console.log('\nTroubleshooting:');
    console.log('  1. Run migrations 001–009 (legacy), then 010 and 011');
    console.log('  2. Run supabase/seed_new_schema.sql');
    console.log('  3. Check RLS policies if tables exist but return 401/403');
  }
}

verifySetup().catch(console.error);
