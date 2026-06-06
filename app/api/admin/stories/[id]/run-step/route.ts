import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { extractEdgeFunctionError, extractErrorMessage } from '@/lib/admin/story-extraction-review'
import { getInvokeOptions, resolveDeployName } from '@/lib/admin/story-pipeline-checklist'
import { edgeFunctionHeaders } from '@/lib/supabase/edge-function-auth'

/** Admin: invoke one pipeline edge function for a story. */
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { data: null, error: { message: 'Server not configured for Edge Function calls' } },
      { status: 503 }
    )
  }

  let body: { step?: string } = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { step?: string }
    }
  } catch {
    body = {}
  }

  const stepInput = body.step?.trim()
  if (!stepInput) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing step (deploy name or step id)' } },
      { status: 400 }
    )
  }

  const deployName = resolveDeployName(stepInput)
  if (!deployName) {
    return NextResponse.json(
      { data: null, error: { message: `Unknown pipeline step: ${stepInput}` } },
      { status: 400 }
    )
  }

  const invokeOptions = getInvokeOptions(deployName)
  const invokeBody: Record<string, unknown> = { story_id: storyId }
  if (invokeOptions.usesMaxChunks && invokeOptions.maxChunks != null) {
    invokeBody.max_chunks = invokeOptions.maxChunks
  }

  const edgeTimeoutMs = invokeOptions.timeoutMs

  try {
    const url = `${supabaseUrl}/functions/v1/${deployName}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...edgeFunctionHeaders(serviceKey),
      },
      body: JSON.stringify(invokeBody),
      signal: AbortSignal.timeout(edgeTimeoutMs),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = extractEdgeFunctionError(data, res.status)
      return NextResponse.json(
        { data: null, error: { message, deploy_name: deployName } },
        { status: res.status >= 500 ? 502 : res.status }
      )
    }

    return NextResponse.json({
      data: { deploy_name: deployName, result: data },
      error: null,
    })
  } catch (error: unknown) {
    const message = extractErrorMessage(error)
    return NextResponse.json(
      { data: null, error: { message, deploy_name: deployName } },
      { status: 502 }
    )
  }
}
