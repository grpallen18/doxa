import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Returns a random active controversy_cluster_id for the Atlas default view. */
export async function GET() {
  const supabase = await createClient()
  try {
    const { data: rows, error } = await supabase
      .from('controversy_clusters')
      .select('controversy_cluster_id')
      .eq('status', 'active')
      .limit(50)

    if (error || !rows?.length) {
      return NextResponse.json({ data: null, error: error?.message ?? 'No controversies found' })
    }

    const random = rows[Math.floor(Math.random() * rows.length)]
    return NextResponse.json({ data: { id: random.controversy_cluster_id }, error: null })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
