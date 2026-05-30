'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  buildExtractionReviewJson,
  buildExtractionReviewMarkdown,
  type StoryExtractionReviewPayload,
} from '@/lib/admin/story-extraction-review'
import { EXTRACTION_ISSUE_TYPES, qaStatusLabel } from '@/lib/admin/extraction-qa-types'
import { ExportSplitButton } from './export-split-button'
import { StoryPipelinePanel } from './story-pipeline-panel'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function FeedbackButtons({
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

export function StoryExtractionReviewView({
  payload,
  onRefresh,
}: {
  payload: StoryExtractionReviewPayload
  onRefresh: () => void | Promise<void>
}) {
  const [approving, setApproving] = useState(false)
  const { story } = payload
  const markdown = useMemo(() => buildExtractionReviewMarkdown(payload), [payload])
  const json = useMemo(() => buildExtractionReviewJson(payload), [payload])
  const storyId = story.story_id
  const exportBasename = `story-extraction-${storyId.slice(0, 8)}`

  const approveQa = async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/qa-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_chunks: true }),
      })
      if (res.ok) onRefresh()
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel variant="soft" interactive={false} className="flex min-h-[400px] flex-col overflow-hidden lg:min-h-0">
        <div className="border-b border-subtle p-4">
          <h2 className="text-lg font-semibold leading-snug">{story.title}</h2>
          <div className="mt-2 space-y-1 text-xs text-muted">
            <p>{story.source_name ?? 'Unknown source'}</p>
            <p>Published {formatDate(story.published_at)}</p>
            <p>
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary hover:underline"
              >
                Open original
              </a>
            </p>
            <p>Status: {story.extraction_status}</p>
            <p>QA: {qaStatusLabel(story.extraction_qa_status)}</p>
            {story.extraction_qa_status === 'needs_human_review' && (
              <Button type="button" size="sm" variant="outline" disabled={approving} onClick={approveQa}>
                {approving ? 'Approving…' : 'Approve QA'}
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1 p-4">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
            {story.article_text ?? (
              <p className="text-muted italic">No article text available (check story_bodies or content_full).</p>
            )}
          </article>
        </ScrollArea>
      </Panel>

      <Panel variant="soft" interactive={false} className="flex min-h-[400px] flex-col overflow-hidden lg:min-h-0">
        <ScrollArea className="flex-1 p-4">
          <StoryPipelinePanel
            payload={payload}
            storyId={storyId}
            onRefresh={async () => {
              await onRefresh()
            }}
            onApproveQa={approveQa}
            approvingQa={approving}
            headerActions={
              <>
                <ExportSplitButton
                  label="Markdown"
                  copyLabel="Copy markdown"
                  downloadLabel="Download markdown"
                  content={markdown}
                  downloadFilename={`${exportBasename}.md`}
                  downloadMimeType="text/markdown"
                />
                <ExportSplitButton
                  label="JSON"
                  copyLabel="Copy JSON"
                  downloadLabel="Download JSON"
                  content={json}
                  downloadFilename={`${exportBasename}.json`}
                  downloadMimeType="application/json"
                />
              </>
            }
            renderFeedback={({ entityType, entityId, existingRating }) => (
              <FeedbackButtons
                storyId={storyId}
                entityType={entityType}
                entityId={entityId}
                existingRating={existingRating}
                onSubmitted={onRefresh}
              />
            )}
          />
        </ScrollArea>
      </Panel>
    </div>
  )
}

export function StoryReviewBreadcrumb({ storyId, title }: { storyId: string; title?: string }) {
  return (
    <div className="flex items-center gap-4">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        Home
      </Link>
      <span className="text-muted">/</span>
      <Link href="/admin" className="text-sm text-muted hover:text-foreground">
        Admin
      </Link>
      <span className="text-muted">/</span>
      <Link href="/admin/stories" className="text-sm text-muted hover:text-foreground">
        Stories
      </Link>
      <span className="text-muted">/</span>
      <span className="max-w-[200px] truncate text-sm font-medium" title={title}>
        {title ?? storyId.slice(0, 8)}
      </span>
    </div>
  )
}
