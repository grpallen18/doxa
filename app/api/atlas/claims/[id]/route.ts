import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const claimId = params.id

    const { data, error } = await supabase
      .from('claims')
      .select('claim_id, canonical_text, subject, predicate, object, timeframe, location, created_at')
      .eq('claim_id', claimId)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: 'Claim not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
