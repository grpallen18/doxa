import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { parseWorkflowCanvasEdgeAttachments } from '@/lib/admin/workflow-canvas/edge-attachments'
import { parseWorkflowCanvasEdgeMeta } from '@/lib/admin/workflow-canvas/edge-meta'
import {
  fetchWorkflowCanvasLayout,
  mergeWorkflowCanvasLayout,
  parseWorkflowCanvasPositions,
  saveWorkflowCanvasLayout,
} from '@/lib/admin/workflow-canvas/layout'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const layout = await fetchWorkflowCanvasLayout(supabase)
    return NextResponse.json(
      {
        data: {
          positions: layout.positions,
          edgeAttachments: layout.edgeAttachments,
          edgeMeta: layout.edgeMeta,
        },
        error: null,
      },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load canvas layout'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const rawPositions = record && 'positions' in record ? record.positions : null
  const rawEdgeAttachments =
    record && 'edgeAttachments' in record ? record.edgeAttachments : null
  const rawEdgeMeta = record && 'edgeMeta' in record ? record.edgeMeta : null

  if (!rawPositions && !rawEdgeAttachments && !rawEdgeMeta) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing positions, edgeAttachments, or edgeMeta' } },
      { status: 400 }
    )
  }

  const incoming = {
    positions: rawPositions ? parseWorkflowCanvasPositions(rawPositions) : undefined,
    edgeAttachments: rawEdgeAttachments
      ? parseWorkflowCanvasEdgeAttachments(rawEdgeAttachments)
      : undefined,
    edgeMeta: rawEdgeMeta ? parseWorkflowCanvasEdgeMeta(rawEdgeMeta) : undefined,
  }

  try {
    const supabase = createAdminClient()
    const existing = await fetchWorkflowCanvasLayout(supabase)
    const merged = mergeWorkflowCanvasLayout(existing, incoming)
    await saveWorkflowCanvasLayout(supabase, merged, auth.user.id)
    return NextResponse.json({
      data: {
        positions: merged.positions,
        edgeAttachments: merged.edgeAttachments,
        edgeMeta: merged.edgeMeta,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save canvas layout'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
