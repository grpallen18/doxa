import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'topic'
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('topics')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const title = typeof body?.title === 'string' ? body.title.trim() : ''

    if (!title || title.length > 200) {
      return NextResponse.json(
        { data: null, error: { message: 'Title is required and must be 1-200 characters' } },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const slug = slugify(title)

    const { data: topic, error } = await supabase
      .from('topics')
      .insert({
        slug,
        title,
        status: 'draft',
        metadata: {},
      })
      .select('topic_id, slug, title, status, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`
        const { data: retry, error: retryError } = await supabase
          .from('topics')
          .insert({
            slug: uniqueSlug,
            title,
            status: 'draft',
            metadata: {},
          })
          .select('topic_id, slug, title, status, created_at')
          .single()

        if (retryError) {
          return NextResponse.json(
            { data: null, error: { message: retryError.message } },
            { status: 500 }
          )
        }
        return NextResponse.json({ data: retry, error: null })
      }
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: topic, error: null })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
