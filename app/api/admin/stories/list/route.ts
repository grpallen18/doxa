import { NextRequest, NextResponse } from 'next/server'
import { createClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { isStoryFriendlyId, normalizeStoryFriendlyId } from '@/lib/admin/friendly-id'
import {
  countEntitiesByStory,
  deriveExtractionStatus,
  type StoryListItem,
} from '@/lib/admin/story-extraction-review'

/** Paginated story search for admin extraction review. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const title = searchParams.get('title')?.trim() || ''
    const source = searchParams.get('source')?.trim() || ''
    const keyword = searchParams.get('keyword')?.trim() || ''
    const sort = searchParams.get('sort') === 'relevant' ? 'relevant' : 'recent'

    const qaStatus = searchParams.get('qa_status')?.trim() || ''

    let storyIdsFromBody: string[] | null = null
    if (keyword) {
      const { data: bodyMatches } = await supabase
        .from('story_bodies')
        .select('story_id')
        .ilike('content_clean', `%${keyword}%`)
        .limit(200)
      storyIdsFromBody = (bodyMatches ?? []).map((r) => r.story_id as string)
    }

    const sourceJoin = source ? 'sources!inner(name)' : 'sources(name)'
    let query = supabase
      .from('stories')
      .select(
        `story_id, friendly_id, title, url, published_at, fetched_at, created_at,
         relevance_status, relevance_score, extraction_completed_at,
         extraction_skipped_empty, merged_at, content_snippet, extraction_qa_status,
         ${sourceJoin}`,
        { count: 'exact' }
      )

    if (source) {
      query = query.ilike('sources.name', `%${source}%`)
    }

    if (title) {
      query = query.ilike('title', `%${title}%`)
    }

    if (keyword) {
      const orParts = [`title.ilike.%${keyword}%`, `content_snippet.ilike.%${keyword}%`]
      if (isStoryFriendlyId(keyword)) {
        orParts.push(`friendly_id.eq.${normalizeStoryFriendlyId(keyword)}`)
      }
      if (storyIdsFromBody && storyIdsFromBody.length > 0) {
        orParts.push(`story_id.in.(${storyIdsFromBody.join(',')})`)
      }
      query = query.or(orParts.join(','))
    }

    if (qaStatus === 'needs_human_review') {
      query = query.eq('extraction_qa_status', 'needs_human_review')
    } else if (qaStatus === 'passed') {
      query = query.eq('extraction_qa_status', 'passed')
    } else if (qaStatus === 'pending_qa') {
      query = query.in('extraction_qa_status', ['pending', 'standardized', 'needs_refinement', 'refined', 'reviewed'])
    }

    if (sort === 'relevant') {
      query = query
        .order('relevance_score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data: rows, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: formatSupabaseAdminError(error.message), code: error.code } },
        { status: 500 }
      )
    }

    const storyIds = (rows ?? []).map((r) => r.story_id as string)
    const entityCounts = await countEntitiesByStory(supabase, storyIds)

    const items: StoryListItem[] = (rows ?? []).map((row) => {
      const src = row.sources as { name: string } | { name: string }[] | null
      const sourceName = Array.isArray(src) ? src[0]?.name ?? null : src?.name ?? null
      const counts = entityCounts.get(row.story_id) ?? {
        claims: 0,
        evidence: 0,
        positions: 0,
        events: 0,
      }
      return {
        story_id: row.story_id,
        friendly_id: row.friendly_id as string,
        title: row.title,
        url: row.url,
        source_name: sourceName,
        published_at: row.published_at,
        fetched_at: row.fetched_at,
        created_at: row.created_at,
        relevance_status: row.relevance_status,
        relevance_score: row.relevance_score,
        extraction_status: deriveExtractionStatus(row),
        extraction_qa_status: (row.extraction_qa_status as StoryListItem['extraction_qa_status']) ?? null,
        claim_count: counts.claims,
        evidence_count: counts.evidence,
        position_count: counts.positions,
        event_count: counts.events,
      }
    })

    return NextResponse.json({
      data: { items, total: count ?? items.length, offset, limit },
      error: null,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
