// Quick script to check if environment variables are set correctly
require('dotenv').config({ path: '.env.local' })

console.log('🔍 Checking environment variables...\n')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('NEXT_PUBLIC_SUPABASE_URL:')
if (url) {
  console.log('  ✅ Set:', url.substring(0, 30) + '...')
} else {
  console.log('  ❌ Missing')
}

console.log('\nNEXT_PUBLIC_SUPABASE_ANON_KEY:')
if (key) {
  console.log('  ✅ Set:', key.substring(0, 20) + '...')
} else {
  console.log('  ❌ Missing')
}

if (!url || !key) {
  console.log('\n⚠️  Issue detected!')
  console.log('\nCommon fixes:')
  console.log('  1. Make sure .env.local is in the project root')
  console.log('  2. Check for typos in variable names')
  console.log('  3. No spaces around = sign')
  console.log('  4. Restart dev server after editing .env.local')
} else {
  console.log('\n✅ All environment variables are set correctly!')
  console.log('   If you still see errors, restart the dev server.')
}
