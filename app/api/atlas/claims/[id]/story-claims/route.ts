import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const claimId = params.id

    const { data: storyClaims, error } = await supabase
      .from('story_claims')
      .select(`
        story_claim_id,
        story_id,
        raw_text,
        polarity,
        stance,
        extraction_confidence,
        created_at,
        stories (
          story_id,
          title,
          url,
          published_at,
          sources (
            source_id,
            name
          )
        )
      `)
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: storyClaims ?? [], error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
