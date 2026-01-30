// Script to help fix .env.local file
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '.env.local')

console.log('🔧 Checking .env.local file...\n')

if (!fs.existsSync(envPath)) {
  console.log('❌ .env.local file not found!')
  console.log('Creating it now...\n')
  
  const content = `NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S
`
  fs.writeFileSync(envPath, content, 'utf8')
  console.log('✅ Created .env.local with correct format!')
  process.exit(0)
}

// Read the file
const content = fs.readFileSync(envPath, 'utf8')
const lines = content.split('\n').filter(line => line.trim())

console.log('Current file content:')
console.log('─'.repeat(50))
lines.forEach((line, i) => {
  if (line.trim() && !line.startsWith('#')) {
    console.log(`${i + 1}: ${line}`)
  }
})
console.log('─'.repeat(50))
console.log()

// Check for issues
let hasIssues = false
const expectedVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
]

expectedVars.forEach(varName => {
  const regex = new RegExp(`^${varName}\\s*=\\s*(.+)$`, 'm')
  const match = content.match(regex)
  
  if (!match) {
    console.log(`❌ ${varName}: Not found or incorrectly formatted`)
    hasIssues = true
  } else {
    const value = match[1].trim()
    if (!value || value.length < 10) {
      console.log(`⚠️  ${varName}: Found but value seems empty or too short`)
      hasIssues = true
    } else {
      console.log(`✅ ${varName}: Found`)
    }
  }
})

if (hasIssues) {
  console.log('\n🔧 Creating corrected .env.local file...')
  
  const corrected = `NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S
`
  
  // Backup old file
  const backupPath = envPath + '.backup'
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, backupPath)
    console.log(`📦 Backed up old file to: ${backupPath}`)
  }
  
  fs.writeFileSync(envPath, corrected, 'utf8')
  console.log('✅ Fixed .env.local file!')
  console.log('\n⚠️  IMPORTANT: Restart your dev server (npm run dev) for changes to take effect!')
} else {
  console.log('\n✅ .env.local file looks correct!')
  console.log('   If you still see errors, try restarting the dev server.')
}
