import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { isEditableOpenAiModelKey, validateModelValue } from '@/lib/admin/openai-model-catalog'
import { applyOpenAiModelConfig } from '@/lib/admin/openai-model-config'

export async function POST(request: NextRequest) {
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
  const key = typeof record?.key === 'string' ? record.key : ''
  const value = typeof record?.value === 'string' ? record.value : ''

  if (!key || !isEditableOpenAiModelKey(key)) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing or invalid model key' } },
      { status: 400 }
    )
  }

  const validated = validateModelValue(value)
  if (typeof validated !== 'string') {
    return NextResponse.json({ data: null, error: { message: validated.error } }, { status: 400 })
  }

  const supabase = createAdminClient()
  const result = await applyOpenAiModelConfig(supabase, key, validated, auth.user.id)

  if ('error' in result) {
    return NextResponse.json({ data: null, error: { message: result.error } }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      entry: result.entry,
      test: result.test,
      sync: result.sync,
    },
    error: null,
  })
}
