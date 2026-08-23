// Connectivity smoke test. Unauthenticated /api/* calls 401 (see middleware).
// For signed-in checks, use TESTING_GUIDE.md (browser session or Playwright).
const BASE_URL = 'http://localhost:3000'

async function testEndpoint(name, url, options = {}) {
  try {
    console.log(`\n🧪 Testing: ${name}`)
    console.log(`   URL: ${url}`)

    const response = await fetch(url, options)
    const data = await response.json()

    console.log(`   Status: ${response.status}`)

    if (response.ok) {
      console.log(`   ✅ Success`)
      if (data.data) {
        if (Array.isArray(data.data)) {
          console.log(`   📊 Count: ${data.data.length}`)
          if (data.data.length > 0) {
            console.log(`   📝 First item keys:`, Object.keys(data.data[0]))
          }
        } else if (typeof data.data === 'object') {
          console.log(`   📝 Keys:`, Object.keys(data.data))
        }
      }
    } else {
      console.log(`   ❌ Error:`, data.error?.message || 'Unknown error')
      if (response.status === 401) {
        console.log('   (Expected without a session — middleware requires auth.)')
      }
    }

    return { success: response.ok, data }
  } catch (error) {
    console.log(`   ❌ Connection error:`, error.message)
    return { success: false, error: error.message }
  }
}

async function runTests() {
  console.log('🚀 Starting Doxa API Endpoint Tests...\n')
  console.log('Waiting for server to be ready...')

  await new Promise(resolve => setTimeout(resolve, 3000))

  // Test 1: List topics
  const topicsResult = await testEndpoint('List Topics', `${BASE_URL}/api/topics`)
  const firstTopicId = topicsResult.data?.data?.[0]?.topic_id

  // Test 2: Get viewpoints (all)
  await testEndpoint('Get Viewpoints', `${BASE_URL}/api/viewpoints`)

  if (firstTopicId) {
    // Test 3: Get topic details by topic_id
    await testEndpoint('Get Topic Details', `${BASE_URL}/api/topics/${firstTopicId}`)

    // Test 4: Get viewpoints for this topic
    await testEndpoint('Get Viewpoints by topic_id', `${BASE_URL}/api/viewpoints?topic_id=${firstTopicId}`)
  } else {
    console.log('\n⚠️  No topics found - run migrations 010, 011 and seed_new_schema.sql')
  }

  console.log('\n✨ Tests complete!')
  console.log('\nIf you see 401s, that is the auth gate (sign in, then retry from the browser).')
  console.log('If you see connection errors, check:')
  console.log('  1. Dev server is running (npm run dev)')
  console.log('  2. .env.local has correct Supabase credentials (restart after edits)')
}

runTests().catch(console.error)
