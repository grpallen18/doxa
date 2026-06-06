'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

type StoryReviewContextValue = {
  storyId: string
  payload: StoryExtractionReviewPayload | null
  loading: boolean
  error: string | null
  refresh: (silent?: boolean) => Promise<void>
}

const StoryReviewContext = createContext<StoryReviewContextValue | null>(null)

export function StoryReviewProvider({
  storyId,
  children,
}: {
  storyId: string
  children: ReactNode
}) {
  const [payload, setPayload] = useState<StoryExtractionReviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    async (silent = false) => {
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
        setError(null)
      } catch {
        if (!silent) {
          setError('Failed to load review')
          setPayload(null)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [storyId]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ storyId, payload, loading, error, refresh }),
    [storyId, payload, loading, error, refresh]
  )

  return <StoryReviewContext.Provider value={value}>{children}</StoryReviewContext.Provider>
}

export function useStoryReview(): StoryReviewContextValue {
  const ctx = useContext(StoryReviewContext)
  if (!ctx) {
    throw new Error('useStoryReview must be used within StoryReviewProvider')
  }
  return ctx
}
