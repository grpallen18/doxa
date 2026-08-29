import { NextRequest, NextResponse } from 'next/server'
import { createClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { isStoryFriendlyId, isUuid, normalizeStoryFriendlyId } from '@/lib/admin/friendly-id'
import {
  countEntitiesByStory,
  deriveExtractionStatus,
  type StoryListItem,
} from '@/lib/admin/story-extraction-review'
import {
  parseStorySorts,
  storyListField,
  type StorySortRule,
} from '@/lib/admin/story-list-fields'
import { sanitizePostgrestPattern } from '@/lib/supabase/filters'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoryQuery = any

function applySort(query: StoryQuery, sort: StorySortRule): StoryQuery {
  const field = storyListField(sort.key)
  const column = field.sortColumn
  if (!column) return query

  const ascending = sort.direction === 'asc'
  if (column === 'source') {
    return query.order('name', {
      referencedTable: 'sources',
      ascending,
      nullsFirst: false,
    })
  }

  if (column === 'relevance_score') {
    return query.order('relevance_score', { ascending, nullsFirst: false })
  }

  return query.order(column, { ascending, nullsFirst: false })
}

function applyExtractionStatusFilter(query: StoryQuery, value: string): StoryQuery {
  switch (value) {
    case 'merged':
      return query.not('merged_at', 'is', null)
    case 'extracted':
      return query
        .not('extraction_completed_at', 'is', null)
        .is('merged_at', null)
        .or('extraction_skipped_empty.is.null,extraction_skipped_empty.eq.false')
    case 'skipped_empty':
      return query.eq('extraction_skipped_empty', true)
    case 'pending_extraction':
      return query
        .is('extraction_completed_at', null)
        .is('merged_at', null)
        .or('extraction_skipped_empty.is.null,extraction_skipped_empty.eq.false')
    default:
      return query
  }
}

/** Paginated story search for admin extraction review. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const sorts = parseStorySorts(searchParams.get('sort'))

    const title = searchParams.get('title')?.trim() || ''
    const source = searchParams.get('source')?.trim() || ''
    const keyword = searchParams.get('keyword')?.trim() || ''
    const author = searchParams.get('author')?.trim() || ''
    const language = searchParams.get('language')?.trim() || ''
    const url = searchParams.get('url')?.trim() || ''
    const friendlyId = searchParams.get('friendly_id')?.trim() || ''
    const qaStatus = searchParams.get('qa_status')?.trim() || ''
    const relevanceStatus = searchParams.get('relevance_status')?.trim() || ''
    const extractionStatus = searchParams.get('extraction_status')?.trim() || ''
    const scrapeSkipped = searchParams.get('scrape_skipped')?.trim() || ''

    let storyIdsFromBody: string[] | null = null
    if (keyword) {
      const { data: bodyMatches } = await supabase
        .from('story_bodies')
        .select('story_id')
        .ilike('content_clean', `%${keyword}%`)
        .limit(200)
      storyIdsFromBody = (bodyMatches ?? []).map((r) => r.story_id as string)
    }

    const needsSourceInner = Boolean(source)
    const sourceJoin = needsSourceInner ? 'sources!inner(name)' : 'sources(name)'

    let query = supabase
      .from('stories')
      .select(
        `story_id, friendly_id, title, url, published_at, fetched_at, created_at,
         relevance_status, relevance_score, extraction_completed_at,
         extraction_skipped_empty, merged_at, content_snippet, extraction_qa_status,
         author, language, scrape_skipped, scraped_at,
         ${sourceJoin}`,
        { count: 'exact' }
      )

    if (source) {
      query = query.ilike('sources.name', `%${source}%`)
    }

    if (title) {
      query = query.ilike('title', `%${title}%`)
    }

    if (author) {
      query = query.ilike('author', `%${author}%`)
    }

    if (language) {
      query = query.ilike('language', `%${language}%`)
    }

    if (url) {
      query = query.ilike('url', `%${url}%`)
    }

    if (friendlyId) {
      if (isStoryFriendlyId(friendlyId)) {
        query = query.eq('friendly_id', normalizeStoryFriendlyId(friendlyId))
      } else {
        query = query.ilike('friendly_id', `%${friendlyId}%`)
      }
    }

    if (keyword) {
      const safeKeyword = sanitizePostgrestPattern(keyword)
      const orParts: string[] = []
      if (safeKeyword) {
        orParts.push(`title.ilike.%${safeKeyword}%`, `content_snippet.ilike.%${safeKeyword}%`)
      }
      if (isStoryFriendlyId(keyword)) {
        orParts.push(`friendly_id.eq.${normalizeStoryFriendlyId(keyword)}`)
      }
      if (storyIdsFromBody && storyIdsFromBody.length > 0) {
        const safeIds = storyIdsFromBody.filter((id) => isUuid(id))
        if (safeIds.length > 0) {
          orParts.push(`story_id.in.(${safeIds.join(',')})`)
        }
      }
      if (orParts.length > 0) {
        query = query.or(orParts.join(','))
      }
    }

    if (qaStatus === 'needs_human_review') {
      query = query.eq('extraction_qa_status', 'needs_human_review')
    } else if (qaStatus === 'passed') {
      query = query.eq('extraction_qa_status', 'passed')
    } else if (qaStatus === 'pending_qa') {
      query = query.in('extraction_qa_status', [
        'pending',
        'standardized',
        'needs_refinement',
        'refined',
        'reviewed',
      ])
    } else if (qaStatus) {
      query = query.eq('extraction_qa_status', qaStatus)
    }

    if (relevanceStatus) {
      query = query.eq('relevance_status', relevanceStatus)
    }

    if (extractionStatus) {
      query = applyExtractionStatusFilter(query, extractionStatus)
    }

    if (scrapeSkipped === 'true') {
      query = query.eq('scrape_skipped', true)
    } else if (scrapeSkipped === 'false') {
      query = query.eq('scrape_skipped', false)
    }

    for (const sort of sorts) {
      query = applySort(query, sort)
    }

    // Stable tie-breaker
    if (!sorts.some((sort) => sort.key === 'created_at')) {
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
