'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  StoryExtractionReviewView,
  StoryReviewBreadcrumb,
} from '../story-extraction-review-view'

export default function AdminStoryExtractionReviewPage() {
  const params = useParams()
  const storyId = typeof params.id === 'string' ? params.id : null
  const [payload, setPayload] = useState<StoryExtractionReviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!storyId) return
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/extraction-review`, {
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) {
        if (!silent) {
          setError(json.error?.message ?? 'Failed to load review')
          setPayload(null)
        }
        return
      }
      setPayload(json.data)
    } catch {
      if (!silent) {
        setError('Failed to load review')
        setPayload(null)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [storyId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <StoryReviewBreadcrumb
          storyId={storyId ?? ''}
          title={payload?.story.title}
        />

        {loading && <p className="text-sm text-muted">Loading extraction review…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && payload && (
          <StoryExtractionReviewView payload={payload} onRefresh={() => load(true)} />
        )}
      </div>
    </main>
  )
}
