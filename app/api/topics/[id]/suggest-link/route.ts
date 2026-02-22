import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const MARKDOWN_LINK_REGEX = /(\[[^\]]+\]\([^)]+\))/g

function isLinkSegment(part: string): boolean {
  return part.startsWith('[') && part.includes('](')
}

function applyLinkToSummary(summary: string, phrase: string, targetTopicId: string): string {
  const linkMarkdown = `[${phrase}](/page/${targetTopicId})`
  const parts = summary.split(MARKDOWN_LINK_REGEX)
  return parts
    .map((part) => {
      if (isLinkSegment(part)) return part
      return part.split(phrase).join(linkMarkdown)
    })
    .join('')
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const topicId = params.id
  if (!topicId) {
    return NextResponse.json(
      { ok: false, error: 'Topic ID required' },
      { status: 400 }
    )
  }

  let body: { span_text?: string; target_topic_id?: string } = {}
  try {
    const raw = await request.json().catch(() => ({}))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { span_text?: string; target_topic_id?: string }
    }
  } catch {
    // use defaults
  }

  const spanText = typeof body.span_text === 'string' ? body.span_text.trim() : ''
  const targetTopicId = typeof body.target_topic_id === 'string' ? body.target_topic_id.trim() : ''

  if (!spanText || !targetTopicId) {
    return NextResponse.json(
      { ok: false, error: 'span_text and target_topic_id are required' },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'Server not configured for Edge Function calls' },
      { status: 503 }
    )
  }

  const admin = createAdminClient()

  const [sourceRes, targetRes] = await Promise.all([
    admin.from('topics').select('topic_id, summary, topic_description, title').eq('topic_id', topicId).single(),
    admin.from('topics').select('topic_id, title, topic_description').eq('topic_id', targetTopicId).single(),
  ])

  const sourceTopic = sourceRes.data as { topic_id: string; summary: string | null; topic_description: string | null; title: string } | null
  const targetTopic = targetRes.data as { topic_id: string; title: string; topic_description: string | null } | null

  if (!sourceTopic || !targetTopic) {
    return NextResponse.json(
      { ok: false, error: 'Topic not found' },
      { status: 404 }
    )
  }

  const summary = sourceTopic.summary ?? ''
  const spanIndex = summary.indexOf(spanText)
  if (spanIndex < 0) {
    return NextResponse.json(
      { ok: false, error: 'Selected text not found in summary' },
      { status: 400 }
    )
  }

  const contextBefore = summary.slice(Math.max(0, spanIndex - 20), spanIndex)
  const contextAfter = summary.slice(spanIndex + spanText.length, spanIndex + spanText.length + 20)

  const url = `${supabaseUrl}/functions/v1/review_link_suggestion`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      span_text: spanText,
      context_before: contextBefore,
      context_after: contextAfter,
      target_topic: {
        title: targetTopic.title,
        topic_description: targetTopic.topic_description ?? '',
      },
    }),
  })

  const data = (await res.json().catch(() => ({}))) as {
    approved?: boolean
    phrase?: string
    reason?: string
    error?: string
  }

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, reason: data?.error ?? `Edge Function ${res.status}` },
      { status: res.status >= 500 ? 502 : res.status }
    )
  }

  if (!data.approved) {
    return NextResponse.json({ ok: false, reason: data.reason ?? 'Suggestion was not approved' })
  }

  const phrase = (data.phrase ?? spanText).trim()
  if (!phrase) {
    return NextResponse.json({ ok: false, reason: 'No phrase to link' })
  }

  const updatedSummary = applyLinkToSummary(summary, phrase, targetTopicId)
  const { error: updateErr } = await admin
    .from('topics')
    .update({ summary: updatedSummary })
    .eq('topic_id', topicId)

  if (updateErr) {
    return NextResponse.json(
      { ok: false, reason: updateErr.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, summary: updatedSummary })
}
