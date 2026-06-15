import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import {
  cleanupOrphanedClaimVersions,
  deleteOrphanedClaimVersion,
  fetchChunkClaimsLifecycle,
  relinkOrphanedClaimVersion,
  resetStaleChunkRefinementCounter,
} from '@/lib/admin/orphaned-claim-versions'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { resolveChunkIndex } from '@/lib/admin/resolve-chunk-ref'
import { extractErrorMessage } from '@/lib/admin/story-extraction-review'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chunkIndex: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id, chunkIndex: chunkRef } = await params
  if (!id || !chunkRef?.trim()) {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid story or chunk ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, id)
    if ('response' in resolved) return resolved.response

    const chunkIndex = await resolveChunkIndex(supabase, resolved.storyUuid, chunkRef)
    if (chunkIndex == null) {
      return NextResponse.json(
        { data: null, error: { message: 'Chunk not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const lifecycle = await fetchChunkClaimsLifecycle(
      supabase,
      resolved.storyUuid,
      chunkIndex
    )

    return NextResponse.json({
      data: {
        chunk_index: chunkIndex,
        orphaned_versions: lifecycle.orphaned_versions,
        lifecycle_issues: lifecycle.lifecycle_issues,
        count: lifecycle.orphaned_versions.length,
        has_repairs:
          lifecycle.orphaned_versions.length > 0 || lifecycle.lifecycle_issues.length > 0,
      },
      error: null,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { data: null, error: { message: extractErrorMessage(error) } },
      { status: 500 }
    )
  }
}

type CleanupBody = {
  confirm?: boolean
  action?:
    | 'delete'
    | 'relink'
    | 'relink_all'
    | 'delete_all'
    | 'reset_refinement_counter'
  version_id?: string
  review_artifact_id?: string | null
  refinement_artifact_id?: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chunkIndex: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id, chunkIndex: chunkRef } = await params
  if (!id || !chunkRef?.trim()) {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid story or chunk ID' } },
      { status: 400 }
    )
  }

  let body: CleanupBody = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as CleanupBody
    }
  } catch {
    body = {}
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { data: null, error: { message: 'Pass { confirm: true } to run cleanup' } },
      { status: 400 }
    )
  }

  const action = body.action
  if (
    action !== 'delete' &&
    action !== 'relink' &&
    action !== 'relink_all' &&
    action !== 'delete_all' &&
    action !== 'reset_refinement_counter'
  ) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            'action must be delete, relink, relink_all, delete_all, or reset_refinement_counter',
        },
      },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, id)
    if ('response' in resolved) return resolved.response

    const chunkIndex = await resolveChunkIndex(supabase, resolved.storyUuid, chunkRef)
    if (chunkIndex == null) {
      return NextResponse.json(
        { data: null, error: { message: 'Chunk not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    if (action === 'reset_refinement_counter') {
      const result = await resetStaleChunkRefinementCounter(supabase, {
        storyId: resolved.storyUuid,
        chunkIndex,
      })
      const lifecycle = await fetchChunkClaimsLifecycle(
        supabase,
        resolved.storyUuid,
        chunkIndex
      )
      return NextResponse.json({
        data: { ...result, lifecycle },
        error: null,
      })
    }

    if (action === 'relink_all' || action === 'delete_all') {
      const result = await cleanupOrphanedClaimVersions(supabase, {
        storyId: resolved.storyUuid,
        chunkIndex,
        action: action === 'relink_all' ? 'relink_all' : 'delete_all',
      })
      const lifecycle = await fetchChunkClaimsLifecycle(
        supabase,
        resolved.storyUuid,
        chunkIndex
      )
      return NextResponse.json({
        data: {
          ...result,
          remaining_orphans: lifecycle.orphaned_versions.length,
          lifecycle_issues: lifecycle.lifecycle_issues,
        },
        error: null,
      })
    }

    if (!body.version_id) {
      return NextResponse.json(
        { data: null, error: { message: 'version_id is required for delete/relink' } },
        { status: 400 }
      )
    }

    if (action === 'delete') {
      const result = await deleteOrphanedClaimVersion(supabase, {
        storyId: resolved.storyUuid,
        chunkIndex,
        versionId: body.version_id,
      })
      return NextResponse.json({ data: result, error: null })
    }

    const result = await relinkOrphanedClaimVersion(supabase, {
      storyId: resolved.storyUuid,
      chunkIndex,
      versionId: body.version_id,
      reviewArtifactId: body.review_artifact_id,
      refinementArtifactId: body.refinement_artifact_id,
    })
    return NextResponse.json({ data: result, error: null })
  } catch (error: unknown) {
    return NextResponse.json(
      { data: null, error: { message: extractErrorMessage(error) } },
      { status: 500 }
    )
  }
}
