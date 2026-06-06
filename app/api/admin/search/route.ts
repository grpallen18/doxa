import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { searchAdminRecords } from '@/lib/admin/admin-search'
import { extractErrorMessage } from '@/lib/admin/story-extraction-review'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10), 50)

  if (!q) {
    return NextResponse.json({ data: { results: [] }, error: null })
  }

  try {
    const supabase = await createClient()
    const results = await searchAdminRecords(supabase, q, limit)
    return NextResponse.json({ data: { results }, error: null })
  } catch (error: unknown) {
    const message = extractErrorMessage(error)
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
