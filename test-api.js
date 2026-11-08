// Smoke checks that do not require a session cookie.
const BASE_URL = 'http://localhost:3000'

async function testEndpoint(name, url, { expectStatus } = {}) {
  try {
    console.log(`\n🧪 Testing: ${name}`)
    console.log(`   URL: ${url}`)

    const response = await fetch(url)
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    console.log(`   Status: ${response.status}`)
    const ok = expectStatus ? response.status === expectStatus : response.ok
    if (ok) {
      console.log(`   ✅ Expected status`)
    } else {
      console.log(`   ❌ Unexpected status (wanted ${expectStatus ?? '2xx'})`)
    }
    if (data && typeof data === 'object') {
      console.log(`   📝 Keys:`, Object.keys(data))
    }

    return { success: ok, status: response.status, data }
  } catch (error) {
    console.log(`   ❌ Connection error:`, error.message)
    return { success: false, error: error.message }
  }
}

async function runTests() {
  console.log('🚀 Doxa API smoke tests (no session)\n')
  console.log('Waiting for server to be ready...')
  await new Promise((resolve) => setTimeout(resolve, 3000))

  await testEndpoint('Topics without session → 401', `${BASE_URL}/api/topics`, {
    expectStatus: 401,
  })

  await testEndpoint('MCP discovery GET (public)', `${BASE_URL}/api/mcp/l3`, {
    expectStatus: 200,
  })

  console.log('\n✨ Smoke complete. Signed-in explore/admin checks: see TESTING_GUIDE.md')
  console.log('If connection failed: npm run dev, then retry.')
}

runTests().catch(console.error)
