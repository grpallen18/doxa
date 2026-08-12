import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEvidenceForProposition } from '@/lib/explore/queries'

type Params = { params: Promise<{ uid: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { uid } = await params
    const decoded = decodeURIComponent(uid)
    const propositionUid = request.nextUrl.searchParams.get('proposition_uid')
    if (!propositionUid) {
      return NextResponse.json({ error: 'proposition_uid required' }, { status: 400 })
    }
    const supabase = await createClient()
    const excerpts = await getEvidenceForProposition(supabase, decoded, propositionUid)
    return NextResponse.json({ excerpts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load evidence'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
