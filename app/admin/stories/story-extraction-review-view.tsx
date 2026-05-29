'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  buildExtractionReviewMarkdown,
  type StoryExtractionReviewPayload,
} from '@/lib/admin/story-extraction-review'
import { EXTRACTION_ISSUE_TYPES, qaStatusLabel } from '@/lib/admin/extraction-qa-types'

type ReviewTab =
  | 'claims'
  | 'evidence'
  | 'positions'
  | 'events'
  | 'links'
  | 'chunks'
  | 'qa'
  | 'export'

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

function entityFeedbackRating(
  feedback: StoryExtractionReviewPayload['feedback'],
  entityType: string,
  entityId: string
): string | undefined {
  const row = feedback.find((f) => f.entity_type === entityType && f.entity_id === entityId)
  return row?.rating
}

export function StoryExtractionReviewView({
  payload,
  onRefresh,
}: {
  payload: StoryExtractionReviewPayload
  onRefresh: () => void
}) {
  const [tab, setTab] = useState<ReviewTab>('claims')
  const [approving, setApproving] = useState(false)
  const { story } = payload
  const markdown = useMemo(() => buildExtractionReviewMarkdown(payload), [payload])
  const storyId = story.story_id

  const copyMarkdown = useCallback(async () => {
    await navigator.clipboard.writeText(markdown)
  }, [markdown])

  const downloadMarkdown = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `story-extraction-${storyId.slice(0, 8)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [markdown, storyId])

  const tabs: { id: ReviewTab; label: string; count?: number }[] = [
    { id: 'claims', label: 'Claims', count: payload.claims.length },
    { id: 'evidence', label: 'Evidence', count: payload.evidence.length },
    { id: 'positions', label: 'Positions', count: payload.positions.length },
    { id: 'events', label: 'Events', count: payload.events.length },
    { id: 'links', label: 'Links' },
    { id: 'chunks', label: 'Chunks', count: payload.chunks.length },
    { id: 'qa', label: 'QA' },
    { id: 'export', label: 'Export' },
  ]

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
        <div className="flex flex-wrap gap-1 border-b border-subtle px-2 pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {t.label}
              {t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 p-4">
          {tab === 'claims' &&
            (payload.claims.length === 0 ? (
              <p className="text-sm text-muted">No claims extracted.</p>
            ) : (
              <ul className="space-y-4">
                {payload.claims.map((c) => (
                  <li key={c.story_claim_id} className="rounded-lg border border-subtle p-3 text-sm">
                    <p className="font-medium">{c.raw_text}</p>
                    <dl className="mt-2 grid gap-1 text-xs text-muted">
                      <div>ID: {c.story_claim_id}</div>
                      <div>Polarity: {c.polarity}</div>
                      {c.stance && <div>Stance: {c.stance}</div>}
                      <div>Confidence: {c.extraction_confidence}</div>
                      {c.claim_id && <div>Canonical claim: {c.claim_id}</div>}
                      <div>
                        Links: {c.linked_evidence_count} evidence · {c.linked_position_count}{' '}
                        positions · {c.linked_event_count} events
                      </div>
                    </dl>
                    <FeedbackButtons
                      storyId={storyId}
                      entityType="claim"
                      entityId={c.story_claim_id}
                      existingRating={entityFeedbackRating(payload.feedback, 'claim', c.story_claim_id)}
                      onSubmitted={onRefresh}
                    />
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'evidence' &&
            (payload.evidence.length === 0 ? (
              <p className="text-sm text-muted">No evidence extracted.</p>
            ) : (
              <ul className="space-y-4">
                {payload.evidence.map((e) => (
                  <li key={e.evidence_id} className="rounded-lg border border-subtle p-3 text-sm">
                    <p>{e.excerpt}</p>
                    <dl className="mt-2 grid gap-1 text-xs text-muted">
                      <div>ID: {e.evidence_id}</div>
                      <div>Type: {e.evidence_type}</div>
                      {e.attribution && <div>Attribution: {e.attribution}</div>}
                      <div>Confidence: {e.extraction_confidence}</div>
                      <div>
                        Links: {e.linked_claim_count} claims · {e.linked_event_count} events
                      </div>
                    </dl>
                    <FeedbackButtons
                      storyId={storyId}
                      entityType="evidence"
                      entityId={e.evidence_id}
                      existingRating={entityFeedbackRating(payload.feedback, 'evidence', e.evidence_id)}
                      onSubmitted={onRefresh}
                    />
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'positions' &&
            (payload.positions.length === 0 ? (
              <p className="text-sm text-muted">No positions extracted.</p>
            ) : (
              <ul className="space-y-4">
                {payload.positions.map((p) => (
                  <li key={p.story_position_id} className="rounded-lg border border-subtle p-3 text-sm">
                    <p className="font-medium">{p.raw_text}</p>
                    <dl className="mt-2 grid gap-1 text-xs text-muted">
                      <div>ID: {p.story_position_id}</div>
                      {p.speaker_type && <div>Speaker: {p.speaker_type}</div>}
                      <div>Confidence: {p.extraction_confidence}</div>
                      {p.canonical_position_id && (
                        <div>Canonical position: {p.canonical_position_id}</div>
                      )}
                      <div>
                        Links: {p.linked_claim_count} claims · {p.linked_evidence_count} evidence
                      </div>
                      {p.excerpt_text && <div className="italic">Excerpt: {p.excerpt_text}</div>}
                    </dl>
                    <FeedbackButtons
                      storyId={storyId}
                      entityType="position"
                      entityId={p.story_position_id}
                      existingRating={entityFeedbackRating(
                        payload.feedback,
                        'position',
                        p.story_position_id
                      )}
                      onSubmitted={onRefresh}
                    />
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'events' &&
            (payload.events.length === 0 ? (
              <p className="text-sm text-muted">No events extracted.</p>
            ) : (
              <ul className="space-y-4">
                {payload.events.map((ev) => (
                  <li key={ev.story_event_id} className="rounded-lg border border-subtle p-3 text-sm">
                    <p className="font-medium">{ev.event_summary}</p>
                    <dl className="mt-2 grid gap-1 text-xs text-muted">
                      <div>ID: {ev.story_event_id}</div>
                      {ev.event_type && <div>Type: {ev.event_type}</div>}
                      {ev.primary_actor && <div>Actor: {ev.primary_actor}</div>}
                      {ev.location && <div>Location: {ev.location}</div>}
                      {(ev.event_date || ev.event_timeframe_start) && (
                        <div>
                          Date: {[ev.event_date, ev.event_timeframe_start, ev.event_timeframe_end]
                            .filter(Boolean)
                            .join(' – ')}
                        </div>
                      )}
                      <div>Confidence: {ev.extraction_confidence}</div>
                      <div>
                        Links: {ev.linked_claim_count} claims · {ev.linked_evidence_count} evidence
                      </div>
                    </dl>
                    <FeedbackButtons
                      storyId={storyId}
                      entityType="event"
                      entityId={ev.story_event_id}
                      existingRating={entityFeedbackRating(payload.feedback, 'event', ev.story_event_id)}
                      onSubmitted={onRefresh}
                    />
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'links' && (
            <div className="space-y-6 text-sm">
              <section>
                <h3 className="font-medium">Claim → Evidence</h3>
                {payload.links.claimEvidence.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {payload.links.claimEvidence.map((l) => (
                      <li key={`${l.story_claim_id}-${l.evidence_id}`}>
                        {l.story_claim_id.slice(0, 8)}… → {l.evidence_id.slice(0, 8)}… ({l.relation_type})
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="font-medium">Claim → Position</h3>
                {payload.links.claimPosition.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {payload.links.claimPosition.map((l) => (
                      <li key={`${l.story_claim_id}-${l.story_position_id}`}>
                        claim {l.story_claim_id.slice(0, 8)}… ↔ position{' '}
                        {l.story_position_id.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="font-medium">Position → Evidence</h3>
                {payload.links.positionEvidence.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {payload.links.positionEvidence.map((l) => (
                      <li key={`${l.story_position_id}-${l.evidence_id}`}>
                        position {l.story_position_id.slice(0, 8)}… ↔ evidence{' '}
                        {l.evidence_id.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="font-medium">Event → Claim</h3>
                {payload.links.eventClaim.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {payload.links.eventClaim.map((l) => (
                      <li key={`${l.story_event_id}-${l.story_claim_id}-${l.relation_type}`}>
                        event {l.story_event_id.slice(0, 8)}… → claim {l.story_claim_id.slice(0, 8)}… (
                        {l.relation_type})
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="font-medium">Event → Evidence</h3>
                {payload.links.eventEvidence.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {payload.links.eventEvidence.map((l) => (
                      <li key={`${l.story_event_id}-${l.evidence_id}`}>
                        event {l.story_event_id.slice(0, 8)}… → evidence {l.evidence_id.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="font-medium">Derived position → event (view)</h3>
                {payload.links.positionEventContext.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {payload.links.positionEventContext.map((l) => (
                      <li key={`${l.story_position_id}-${l.story_event_id}-${l.link_path}`}>
                        position {l.story_position_id.slice(0, 8)}… ↔ event{' '}
                        {l.story_event_id.slice(0, 8)}… ({l.link_path})
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'chunks' &&
            (payload.chunks.length === 0 ? (
              <p className="text-sm text-muted">No chunks (story may not be chunked yet).</p>
            ) : (
              <ul className="space-y-4">
                {payload.chunks.map((ch) => (
                  <li key={ch.chunk_index} className="rounded-lg border border-subtle p-3 text-sm">
                    <p className="font-medium">Chunk {ch.chunk_index}</p>
                    <p className="text-xs text-muted">QA: {qaStatusLabel(ch.extraction_qa_status)}</p>
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/20 p-2 text-xs">
                      {JSON.stringify(ch.extraction_json, null, 2)?.slice(0, 4000) ?? 'null'}
                    </pre>
                    {ch.extraction_qa_validation_report != null && (
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/20 p-2 text-xs">
                        {JSON.stringify(ch.extraction_qa_validation_report, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'qa' && (
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-medium">Story QA</h3>
                <p className="text-xs text-muted">Status: {qaStatusLabel(story.extraction_qa_status)}</p>
                {story.extraction_qa_validation_report != null && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/20 p-2 text-xs">
                    {JSON.stringify(story.extraction_qa_validation_report, null, 2)}
                  </pre>
                )}
              </section>
              <section>
                <h3 className="font-medium">Review report</h3>
                {story.extraction_qa_review_report != null ? (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/20 p-2 text-xs">
                    {JSON.stringify(story.extraction_qa_review_report, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted">None</p>
                )}
              </section>
              <section>
                <h3 className="font-medium">Artifacts ({payload.qa_artifacts.length})</h3>
                {payload.qa_artifacts.length === 0 ? (
                  <p className="text-xs text-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-2 text-xs">
                    {payload.qa_artifacts.map((a) => (
                      <li key={a.id} className="rounded border border-subtle p-2">
                        <div>{a.stage}</div>
                        <div className="text-muted">{formatDate(a.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'export' && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Export the full review packet for use in Cursor or another LLM.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={copyMarkdown}>
                  Copy Markdown
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={downloadMarkdown}>
                  Download .md
                </Button>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg border border-subtle bg-muted/20 p-3 text-xs whitespace-pre-wrap">
                {markdown.slice(0, 8000)}
                {markdown.length > 8000 ? '\n\n… (truncated preview)' : ''}
              </pre>
            </div>
          )}
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
