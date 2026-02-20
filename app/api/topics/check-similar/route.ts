import { NextRequest, NextResponse } from 'next/server'

/** Calls process_topic Edge Function with check_similar mode. Returns similar_topics and controversies_count. */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { data: null, error: { message: 'Server not configured for Edge Function calls' } },
      { status: 503 }
    )
  }

  let body: { title?: string } = {}
  try {
    const raw = await request.json().catch(() => ({}))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { title?: string }
    }
  } catch {
    // use defaults
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return NextResponse.json(
      { data: null, error: { message: 'Title is required' } },
      { status: 400 }
    )
  }

  const url = `${supabaseUrl}/functions/v1/process_topic`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ title, check_similar: true }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: { message: data?.error ?? `Edge Function ${res.status}` } },
      { status: res.status >= 500 ? 502 : res.status }
    )
  }

  return NextResponse.json({
    data: {
      controversies_count: data.controversies_count ?? 0,
      similar_topics: data.similar_topics ?? [],
    },
    error: null,
  })
}
