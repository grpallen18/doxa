import { NextRequest, NextResponse } from 'next/server'
import { createClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { extractErrorMessage } from '@/lib/admin/story-extraction-review'
import { REVERT_SCOPE_STEP_IDS, type PipelineStepId } from '@/lib/admin/story-pipeline-checklist'

/** Admin: revert one pipeline step (ingestion through review chunk claims). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id: storyId } = await params
  if (!storyId) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing story ID' } },
      { status: 400 }
    )
  }

  let body: { step?: string; confirm?: boolean } = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { step?: string; confirm?: boolean }
    }
  } catch {
    body = {}
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { data: null, error: { message: 'Pass { confirm: true } to revert a pipeline step' } },
      { status: 400 }
    )
  }

  const stepInput = body.step?.trim()
  if (!stepInput) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing step id' } },
      { status: 400 }
    )
  }

  if (!REVERT_SCOPE_STEP_IDS.includes(stepInput as PipelineStepId)) {
    return NextResponse.json(
      { data: null, error: { message: `Step cannot be reverted: ${stepInput}` } },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('revert_story_pipeline_step', {
      p_story_id: storyId,
      p_step_id: stepInput,
    })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: formatSupabaseAdminError(error.message) } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = formatSupabaseAdminError(extractErrorMessage(error))
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
