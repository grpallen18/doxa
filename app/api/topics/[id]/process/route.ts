import { NextRequest, NextResponse } from 'next/server'

/** Invokes process_topic Edge Function for the given topic_id. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const topicId = params.id
  if (!topicId) {
    return NextResponse.json(
      { data: null, error: { message: 'Topic ID required' } },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { data: null, error: { message: 'Server not configured for Edge Function calls' } },
      { status: 503 }
    )
  }

  let body: { preview?: boolean; confirm?: boolean } = {}
  try {
    const raw = await request.json().catch(() => ({}))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { preview?: boolean; confirm?: boolean }
    }
  } catch {
    // use defaults
  }

  const url = `${supabaseUrl}/functions/v1/process_topic`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      topic_id: topicId,
      preview: body.preview,
      confirm: body.confirm,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: { message: data?.error ?? `Edge Function ${res.status}` } },
      { status: res.status >= 500 ? 502 : res.status }
    )
  }

  return NextResponse.json({ data, error: null })
}
