'use client'

import Link from 'next/link'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { ArticleSpan } from '@/lib/admin/article-span-highlight'
import { resolveArticleSpan } from '@/lib/admin/article-span-highlight'
import { ConfidenceBadge } from '@/components/admin/record/confidence-badge'
import { StatusBadge } from '@/components/admin/record/status-badge'

export function AtomList({
  payload,
  articleText,
  onHighlightSpan,
}: {
  payload: StoryExtractionReviewPayload
  articleText: string | null
  onHighlightSpan?: (span: ArticleSpan | null) => void
}) {
  const { claims, positions, events, evidence } = payload

  const hoverHandlers = (
    chunkIndex: number | null,
    spanStart: number | null,
    spanEnd: number | null,
    sourceExcerpt: string | null
  ) => {
    if (!articleText || !onHighlightSpan) return {}
    return {
      onMouseEnter: () => {
        const span = resolveArticleSpan(articleText, payload.chunks, {
          chunkIndex: chunkIndex ?? 0,
          spanStart,
          spanEnd,
          sourceExcerpt,
        })
        onHighlightSpan(span)
      },
      onMouseLeave: () => onHighlightSpan(null),
    }
  }

  return (
    <div className="space-y-4 text-sm">
      {claims.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Claims ({claims.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {claims.map((c) => (
              <li
                key={c.story_claim_id}
                className="rounded-md border border-subtle px-3 py-2"
                {...hoverHandlers(null, c.span_start, c.span_end, c.raw_text)}
              >
                <p className="leading-snug">{c.raw_text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge label={c.polarity} variant="muted" />
                  {c.stance && <StatusBadge label={c.stance} variant="default" />}
                  <ConfidenceBadge value={c.extraction_confidence} />
                  {c.claim_id && (
                    <Link
                      href={`/admin/records/claims/${c.claim_id}`}
                      className="text-accent-primary hover:underline"
                    >
                      Canonical claim
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {positions.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Positions ({positions.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {positions.map((p) => (
              <li key={p.story_position_id} className="rounded-md border border-subtle px-3 py-2">
                <p className="leading-snug">{p.raw_text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <ConfidenceBadge value={p.extraction_confidence} />
                  {p.canonical_position_id && (
                    <Link
                      href={`/admin/records/positions/${p.canonical_position_id}`}
                      className="text-accent-primary hover:underline"
                    >
                      Canonical position
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Events ({events.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {events.map((e) => (
              <li key={e.story_event_id} className="rounded-md border border-subtle px-3 py-2">
                <p className="leading-snug">{e.event_summary}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <ConfidenceBadge value={e.extraction_confidence} />
                  {e.event_id && (
                    <Link
                      href={`/admin/records/events/${e.event_id}`}
                      className="text-accent-primary hover:underline"
                    >
                      Canonical event
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Evidence ({evidence.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {evidence.map((ev) => (
              <li
                key={ev.evidence_id}
                className="rounded-md border border-subtle px-3 py-2"
                {...hoverHandlers(null, ev.span_start, ev.span_end, ev.excerpt)}
              >
                <p className="text-xs text-muted">{ev.evidence_type}</p>
                <p className="mt-0.5 leading-snug">{ev.excerpt}</p>
                <ConfidenceBadge value={ev.extraction_confidence} className="mt-1" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {claims.length === 0 &&
        positions.length === 0 &&
        events.length === 0 &&
        evidence.length === 0 && (
          <p className="text-xs text-muted">No extracted atoms yet.</p>
        )}
    </div>
  )
}
