import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getControversyDetail, getEvidenceBundle } from '@/lib/explore/queries'

type Params = { params: Promise<{ uid: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { uid } = await params
    const decoded = decodeURIComponent(uid)
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const includeEvidence = request.nextUrl.searchParams.get('evidence') === '1'
    const detail = await getControversyDetail(supabase, decoded, user?.id)
    if (!detail) return NextResponse.json({ error: 'Controversy not found' }, { status: 404 })
    if (!includeEvidence) return NextResponse.json(detail)
    const evidence = await getEvidenceBundle(supabase, decoded)
    return NextResponse.json({ ...detail, evidence })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load controversy'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
