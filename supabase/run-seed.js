// Script to seed the database using Supabase client
// Run with: node supabase/run-seed.js

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gjxihyaovyfwajjyoyoz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('   Get it from: Supabase Dashboard > Settings > API > service_role key');
  console.error('   Then run: $env:SUPABASE_SERVICE_ROLE_KEY="your_key_here"');
  process.exit(1);
}

async function runSeed() {
  console.log('🌱 Seeding database...\n');

  // Read the seed SQL file (target schema: after migrations 010 and 011)
  const seedPath = path.join(__dirname, 'seed_new_schema.sql');
  const seedSQL = fs.readFileSync(seedPath, 'utf8');

  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Execute the seed SQL
    // Note: Supabase JS client doesn't have a direct SQL execution method
    // We need to use the REST API directly
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: seedSQL }),
    });

    if (!response.ok) {
      // If RPC doesn't exist, run the seed in the SQL Editor
      console.log('⚠️  Direct SQL execution not available via API');
      console.log('📋 Please run the seed SQL manually:');
      console.log('   1. Open Supabase Dashboard → SQL Editor');
      console.log('   2. Paste the contents of supabase/seed_new_schema.sql');
      console.log('   3. Run the script');
      console.log('   Or, if using Supabase CLI with a linked project: supabase db execute -f supabase/seed_new_schema.sql');
      return;
    }

    const result = await response.json();
    console.log('✅ Seed completed successfully!');
    console.log(result);
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    console.log('\n📋 Alternative: Run seed SQL manually');
    console.log('   1. Open Supabase Dashboard → SQL Editor');
    console.log('   2. Paste the contents of supabase/seed_new_schema.sql');
    console.log('   3. Run the script');
    console.log('   Or, if using Supabase CLI with a linked project: supabase db execute -f supabase/seed_new_schema.sql');
  }
}

runSeed();
