// Quick test: call Atlas APIs (requires dev server running on localhost:3000)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })

const base = 'http://localhost:3000'

async function test() {
  console.log('Testing Atlas APIs...\n')

  const r1 = await fetch(base + '/api/atlas/maps')
  const d1 = await r1.json()
  console.log('1. GET /api/atlas/maps:', r1.status)
  console.log('   Maps count:', d1?.data?.length ?? 0)
  if (d1?.error) console.log('   Error:', d1.error)

  const r2 = await fetch(base + '/api/atlas/controversies/random')
  const d2 = await r2.json()
  console.log('\n2. GET /api/atlas/controversies/random:', r2.status)
  console.log('   Response:', JSON.stringify(d2))
  if (d2?.error) console.log('   Error:', d2.error)

  if (d2?.data?.id) {
    const r3 = await fetch(base + '/api/atlas/controversy/' + d2.data.id)
    const d3 = await r3.json()
    console.log('\n3. GET /api/atlas/controversy/' + d2.data.id + ':', r3.status)
    console.log('   Nodes:', d3?.data?.nodes?.length ?? 0)
    console.log('   SourceDetails:', d3?.data?.sourceDetails?.length ?? 0)
    if (d3?.error) console.log('   Error:', d3.error)
  }

  console.log('\nDone. If dev server is not running, you will see connection errors.')
}

test().catch(console.error)
