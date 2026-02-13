import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  try {
    const searchParams = request.nextUrl.searchParams
    const scopeType = searchParams.get('scope_type')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('viz_maps')
      .select('id, name, scope_type, scope_id, time_window_days, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (scopeType) {
      query = query.eq('scope_type', scopeType)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: data ?? [], error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
