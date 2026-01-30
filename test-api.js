// Quick API test script
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
  
  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Test 1: List nodes
  const nodesResult = await testEndpoint('List Nodes', `${BASE_URL}/api/nodes`)
  const firstNodeId = nodesResult.data?.data?.[0]?.id
  
  // Test 2: Get perspectives
  await testEndpoint('Get Perspectives', `${BASE_URL}/api/perspectives`)
  
  // Test 3: Get graph
  await testEndpoint('Get Graph', `${BASE_URL}/api/graph`)
  
  if (firstNodeId) {
    // Test 4: Get node details
    await testEndpoint('Get Node Details', `${BASE_URL}/api/nodes/${firstNodeId}`)
    
    // Test 5: Get neighbors
    await testEndpoint('Get Neighbors', `${BASE_URL}/api/graph/${firstNodeId}/neighbors`)
    
    // Test 6: Get validation stats
    await testEndpoint('Get Validation Stats', `${BASE_URL}/api/validate/${firstNodeId}/stats`)
  } else {
    console.log('\n⚠️  No nodes found - make sure seed data was loaded in Supabase')
  }
  
  console.log('\n✨ Tests complete!')
  console.log('\nIf you see errors, check:')
  console.log('  1. Dev server is running (npm run dev)')
  console.log('  2. .env.local has correct Supabase credentials')
  console.log('  3. Database has been seeded (run supabase/seed.sql)')
}

runTests().catch(console.error)
