import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const thesisId = params.id

    const { data, error } = await supabase
      .from('theses')
      .select('thesis_id, thesis_text, label, summary, created_at')
      .eq('thesis_id', thesisId)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: 'Thesis not found', code: 'NOT_FOUND' } },
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
