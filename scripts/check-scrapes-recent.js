/**
 * One-off script to verify scrape_log has recent data.
 * Run: node scripts/check-scrapes-recent.js
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('=== 1. Raw scrapes in last 6 hours (most recent first) ===')
  const { data: recent, error: e1 } = await supabase
    .from('scrape_log')
    .select('id, created_at, outcome')
    .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  if (e1) {
    console.error('Error:', e1.message)
    return
  }
  console.log(`Found ${recent?.length ?? 0} rows (showing up to 20)`)
  recent?.forEach((r) => {
    const d = new Date(r.created_at)
    console.log(`  ${r.created_at}  (${d.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST)  ${r.outcome}`)
  })

  console.log('\n=== 2. Scrapes per hour (last 24h) - what get_scrape_counts_by_hour returns ===')
  const { data: hourly, error: e2 } = await supabase.rpc('get_scrape_counts_by_hour', { p_hours: 24 })
  if (e2) {
    console.error('Error:', e2.message)
    return
  }
  console.log(`RPC returned ${hourly?.length ?? 0} buckets`)
  const lastFive = hourly?.slice(-5) ?? []
  lastFive.forEach((r) => {
    const d = new Date(r.bucket)
    console.log(`  ${r.bucket}  (${d.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST)  success=${r.success_count} failure=${r.failure_count}`)
  })

  console.log('\n=== 3. Any scrapes after 1:00 PM CST (19:00 UTC)? ===')
  const onePmCst = new Date('2026-02-22T19:00:00.000Z')
  const { data: after1pm, error: e3 } = await supabase
    .from('scrape_log')
    .select('id, created_at, outcome')
    .gte('created_at', onePmCst.toISOString())
    .order('created_at', { ascending: false })
  console.log(`Scrapes after 1 PM CST (19:00 UTC): ${after1pm?.length ?? 0}`)
  after1pm?.slice(0, 5).forEach((r) => {
    const d = new Date(r.created_at)
    console.log(`  ${r.created_at}  (${d.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST)`)
  })

  console.log('\n=== 4. Server "now" vs 24h ago ===')
  const { data: nowCheck } = await supabase.from('scrape_log').select('created_at').order('created_at', { ascending: false }).limit(1).single()
  console.log('Most recent scrape_log.created_at:', nowCheck?.created_at ?? 'N/A')
  console.log('Current time (JS):', new Date().toISOString())
  console.log('Current time (CST):', new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
}

main().catch(console.error)
