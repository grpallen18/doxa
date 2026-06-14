import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllAgentDisplayNames } from '@/lib/admin/agent-display-names'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const displayNames = await fetchAllAgentDisplayNames(supabase)
    return NextResponse.json(
      { data: { displayNames }, error: null },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load display names'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
