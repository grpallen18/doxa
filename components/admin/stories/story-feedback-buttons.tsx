'use client'

import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { EXTRACTION_ISSUE_TYPES } from '@/lib/admin/extraction-qa-types'

export function StoryFeedbackButtons({
  storyId,
  entityType,
  entityId,
  existingRating,
  onSubmitted,
}: {
  storyId: string
  entityType: 'claim' | 'evidence' | 'position' | 'event'
  entityId: string
  existingRating?: string
  onSubmitted: () => void
}) {
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [issueTypes, setIssueTypes] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const submit = async (rating: 'like' | 'dislike') => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          rating,
          notes: notes.trim() || null,
          issue_types: rating === 'dislike' && issueTypes.length > 0 ? issueTypes : null,
          pipeline_stage: 'merge',
        }),
      })
      if (res.ok) onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        title="Good extraction"
        disabled={submitting}
        onClick={() => submit('like')}
        className={`rounded p-1 transition-colors ${existingRating === 'like' ? 'bg-green-500/20 text-green-600' : 'text-muted hover:text-foreground'}`}
      >
        <ThumbsUp className="size-4" />
      </button>
      <button
        type="button"
        title="Bad extraction"
        disabled={submitting}
        onClick={() => submit('dislike')}
        className={`rounded p-1 transition-colors ${existingRating === 'dislike' ? 'bg-red-500/20 text-red-600' : 'text-muted hover:text-foreground'}`}
      >
        <ThumbsDown className="size-4" />
      </button>
      <button
        type="button"
        className="text-xs text-muted hover:text-foreground"
        onClick={() => setShowNotes((v) => !v)}
      >
        Notes
      </button>
      {showNotes && (
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note"
          className="min-w-[120px] flex-1 rounded border border-input bg-transparent px-2 py-1 text-xs"
        />
      )}
      {showNotes && (
        <div className="flex w-full flex-wrap gap-1">
          {EXTRACTION_ISSUE_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={issueTypes.includes(t)}
                onChange={(e) =>
                  setIssueTypes((prev) =>
                    e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                  )
                }
              />
              {t.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
