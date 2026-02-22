import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

type DrilldownRow = {
  domain: string
  story_id: string
  title: string
  url: string
  error: string | null
  created_at: string
}

/** Returns scrape log rows for a time bucket. Admin only.
 *  Used for cross-highlight drill-down from the health chart. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const searchParams = request.nextUrl.searchParams
    const bucket = searchParams.get('bucket')
    const granularity = (searchParams.get('granularity') || 'hour') as string
    const outcome = (searchParams.get('outcome') || 'failure') as string

    if (!bucket) {
      return NextResponse.json(
        { data: null, error: { message: 'Missing bucket parameter' } },
        { status: 400 }
      )
    }

    const bucketDate = new Date(bucket)
    if (isNaN(bucketDate.getTime())) {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid bucket format' } },
        { status: 400 }
      )
    }

    const validGranularity = granularity === '5min' || granularity === 'hour'
    const validOutcome = outcome === 'failure' || outcome === 'success'

    if (!validGranularity || !validOutcome) {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid granularity or outcome' } },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('get_scrape_drilldown', {
      p_bucket: bucket,
      p_granularity: granularity,
      p_outcome: outcome,
    })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const formatted = (data ?? []).map((row: DrilldownRow) => ({
      domain: row.domain,
      storyId: row.story_id,
      title: row.title,
      url: row.url,
      error: row.error,
      createdAt: row.created_at,
    }))

    return NextResponse.json({ data: formatted, error: null })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
