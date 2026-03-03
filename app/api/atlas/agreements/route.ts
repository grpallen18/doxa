import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Returns active agreement clusters for the Atlas selector. */
export async function GET() {
  const supabase = await createClient()
  try {
    const { data: clusters, error } = await supabase
      .from('agreement_clusters')
      .select('agreement_cluster_id, label, summary')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const ids = (clusters ?? []).map((c) => c.agreement_cluster_id)
    if (ids.length === 0) {
      return NextResponse.json({
        data: { items: [] },
        error: null,
      })
    }

    const { data: posCounts } = await supabase
      .from('agreement_cluster_positions')
      .select('agreement_cluster_id')
      .in('agreement_cluster_id', ids)

    const positionCountByAgreement = new Map<string, number>()
    for (const row of posCounts ?? []) {
      const aid = row.agreement_cluster_id as string
      positionCountByAgreement.set(aid, (positionCountByAgreement.get(aid) ?? 0) + 1)
    }

    const items = (clusters ?? []).map((c) => ({
      agreement_cluster_id: c.agreement_cluster_id,
      label: c.label ?? null,
      summary: c.summary ?? null,
      position_count: positionCountByAgreement.get(c.agreement_cluster_id) ?? 0,
    }))

    return NextResponse.json({
      data: { items },
      error: null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
