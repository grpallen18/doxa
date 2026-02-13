import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  try {
    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q')?.trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    if (!q || q.length < 2) {
      return NextResponse.json({ data: [], error: null })
    }

    const results: Array<{
      entity_type: 'thesis' | 'claim' | 'story'
      entity_id: string
      map_id: string | null
      label: string
    }> = []

    // Search theses (thesis_text, label)
    const { data: theses } = await supabase
      .from('theses')
      .select('thesis_id, thesis_text, label')
      .or(`thesis_text.ilike.%${q}%,label.ilike.%${q}%`)
      .limit(limit)

    if (theses?.length) {
      const { data: maps } = await supabase
        .from('viz_maps')
        .select('id, scope_id')
        .eq('scope_type', 'thesis')
        .in('scope_id', theses.map((t) => t.thesis_id))

      const mapByThesis = new Map((maps ?? []).map((m: { id: string; scope_id: string }) => [m.scope_id, m.id]))
      for (const t of theses) {
        results.push({
          entity_type: 'thesis',
          entity_id: t.thesis_id,
          map_id: mapByThesis.get(t.thesis_id) ?? null,
          label: (t.thesis_text || t.label || t.thesis_id).slice(0, 120),
        })
      }
    }

    // Search claims (canonical_text)
    const { data: claims } = await supabase
      .from('claims')
      .select('claim_id, canonical_text')
      .ilike('canonical_text', `%${q}%`)
      .limit(limit)

    if (claims?.length) {
      const claimIds = claims.map((c) => c.claim_id)
      const { data: nodeRows } = await supabase
        .from('viz_nodes')
        .select('map_id, entity_id')
        .eq('entity_type', 'claim')
        .in('entity_id', claimIds)

      const mapByClaim = new Map<string, string>()
      for (const n of nodeRows ?? []) {
        mapByClaim.set(n.entity_id, n.map_id)
      }

      for (const c of claims) {
        results.push({
          entity_type: 'claim',
          entity_id: c.claim_id,
          map_id: mapByClaim.get(c.claim_id) ?? null,
          label: c.canonical_text.slice(0, 120),
        })
      }
    }

    // Search stories (title)
    const { data: stories } = await supabase
      .from('stories')
      .select('story_id, title')
      .ilike('title', `%${q}%`)
      .limit(limit)

    if (stories?.length) {
      for (const s of stories) {
        results.push({
          entity_type: 'story',
          entity_id: s.story_id,
          map_id: null,
          label: s.title.slice(0, 120),
        })
      }
    }

    return NextResponse.json({ data: results.slice(0, limit), error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
