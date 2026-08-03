import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { loadGraphJobStatus } from '@/lib/graph/job-status'

type RouteParams = { params: Promise<{ storyId: string }> }

/** Latest graph job + story.graph_status for Neo document workspace. Admin only. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { storyId } = await params
  if (!storyId) {
    return NextResponse.json(
      { data: null, error: { message: 'storyId required' } },
      { status: 400 }
    )
  }

  try {
    const status = await loadGraphJobStatus(storyId)
    if (!status) {
      return NextResponse.json(
        { data: null, error: { message: 'Story not found' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: status, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load graph status'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
