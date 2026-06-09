import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchClaimsHistory,
  fetchEventsHistory,
  fetchPositionsHistory,
  fetchStoryChunksHistory,
} from '@/lib/admin/history'
import { paginatedApiPayload, parseAuditListParams } from '@/lib/admin/api-pagination'

export async function fetchPaginatedClaimsAudit(
  supabase: SupabaseClient,
  claimId: string,
  request: NextRequest
) {
  const viewAll = request.nextUrl.searchParams.get('view') === 'all'
  const { limit, offset } = parseAuditListParams(
    request.nextUrl.searchParams,
    viewAll ? 'view_all' : 'embed'
  )
  const { events, total } = await fetchClaimsHistory(supabase, claimId, { limit, offset })
  return paginatedApiPayload(events, limit, offset, total)
}

export async function fetchPaginatedEventsAudit(
  supabase: SupabaseClient,
  eventId: string,
  request: NextRequest
) {
  const viewAll = request.nextUrl.searchParams.get('view') === 'all'
  const { limit, offset } = parseAuditListParams(
    request.nextUrl.searchParams,
    viewAll ? 'view_all' : 'embed'
  )
  const { events, total } = await fetchEventsHistory(supabase, eventId, { limit, offset })
  return paginatedApiPayload(events, limit, offset, total)
}

export async function fetchPaginatedPositionsAudit(
  supabase: SupabaseClient,
  positionId: string,
  request: NextRequest
) {
  const viewAll = request.nextUrl.searchParams.get('view') === 'all'
  const { limit, offset } = parseAuditListParams(
    request.nextUrl.searchParams,
    viewAll ? 'view_all' : 'embed'
  )
  const { events, total } = await fetchPositionsHistory(supabase, positionId, {
    limit,
    offset,
  })
  return paginatedApiPayload(events, limit, offset, total)
}

export async function fetchPaginatedChunkAudit(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number,
  request: NextRequest
) {
  const viewAll = request.nextUrl.searchParams.get('view') === 'all'
  const { limit, offset } = parseAuditListParams(
    request.nextUrl.searchParams,
    viewAll ? 'view_all' : 'embed'
  )
  const { events, total } = await fetchStoryChunksHistory(supabase, storyId, chunkIndex, {
    limit,
    offset,
  })
  return paginatedApiPayload(events, limit, offset, total)
}
