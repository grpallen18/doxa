'use client'

import { useMemo, useState } from 'react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { ScrollProgress } from '@/components/motion-primitives/scroll-progress'
import { useRegisterToc } from '@/components/topic-explore-context'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { ControversyQuestionHeader } from '@/components/explore/controversy-question-header'
import { SharedClashStrip } from '@/components/explore/shared-clash-strip'
import { ViewpointPanel } from '@/components/explore/viewpoint-panel'
import { EvidenceSheet } from '@/components/explore/evidence-sheet'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { AnalyzedCallout } from '@/components/explore/analyzed-callout'
import { ExplorePollPanel } from '@/components/explore/explore-poll-panel'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ExploreControversyDetail, SampleProposition } from '@/lib/explore/types'
import { toast } from 'sonner'
import { homePath, topicHubPath } from '@/lib/explore-routes'

export function ControversyExplorePage({
  detail,
  isAuthenticated,
}: {
  detail: ExploreControversyDetail
  isAuthenticated: boolean
}) {
  const [activeVp, setActiveVp] = useState(0)
  const [selectedProp, setSelectedProp] = useState<SampleProposition | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [feedbackReason, setFeedbackReason] = useState('bad_representation')
  const [feedbackDetail, setFeedbackDetail] = useState('')

  const tocSections = useMemo(
    () => [
      { id: 'question', title: 'Question' },
      { id: 'overview', title: 'Shared & clash' },
      { id: 'viewpoints', title: 'Viewpoints' },
      ...(detail.assessments.length ? [{ id: 'analyzed', title: 'Analyzed' }] : []),
      ...(detail.related.length ? [{ id: 'related', title: 'Related' }] : []),
    ],
    [detail.assessments.length, detail.related.length]
  )

  useRegisterToc({
    sections: tocSections,
    backLink: detail.topic_slug
      ? { href: topicHubPath(detail.topic_slug), label: detail.topic_title || detail.topic_slug }
      : { href: homePath(), label: 'Explore' },
  })

  const openProp = (prop: SampleProposition) => {
    setSelectedProp(prop)
    setSheetOpen(true)
  }

  const submitControversyFeedback = async () => {
    try {
      const res = await fetch('/api/explore/critiques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_kind: 'controversy',
          target_uid: detail.uid,
          reason: feedbackReason,
          detail: feedbackDetail.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Feedback recorded')
      setFeedbackDetail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Feedback failed')
    }
  }

  const crumbs = [
    { label: 'Explore', href: homePath() },
    ...(detail.topic_slug
      ? [{ label: detail.topic_title || detail.topic_slug, href: topicHubPath(detail.topic_slug) }]
      : []),
    { label: detail.question.length > 48 ? `${detail.question.slice(0, 45)}…` : detail.question },
  ]

  return (
    <main className="relative min-h-[calc(100svh-var(--header-height))] min-w-0 overflow-x-hidden text-foreground">
      <div className="pointer-events-none fixed left-0 right-0 top-[var(--header-height)] z-40 h-0.5">
        <ScrollProgress className="absolute inset-x-0 top-0 h-0.5 bg-accent-primary" />
      </div>
      <div className="min-w-0 space-y-8 px-4 py-5 sm:px-6 lg:px-8">
        <ExploreBreadcrumbs items={crumbs} />
        <ControversyQuestionHeader
          question={detail.question}
          sidesCount={detail.sides_count}
          sourceCount={detail.source_count}
          updatedAt={detail.updated_at}
          controversyUid={detail.uid}
          initiallySaved={detail.saved}
          isAuthenticated={isAuthenticated}
        />
        <SharedClashStrip
          shared={detail.shared_bullets}
          clash={detail.clash_bullets}
          disputes={detail.dispute_bullets}
        />

        <section id="viewpoints" className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Viewpoints
          </h2>
          {detail.viewpoints.length === 0 ? (
            <Panel variant="soft" interactive={false} className="p-4 text-sm text-muted">
              Viewpoints have not been projected for this controversy yet.
            </Panel>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto md:hidden">
                {detail.viewpoints.map((vp, i) => (
                  <button
                    key={vp.uid}
                    type="button"
                    onClick={() => setActiveVp(i)}
                    className={cn(
                      'shrink-0 rounded-bevel border border-border px-3 py-1.5 text-xs',
                      i === activeVp
                        ? 'bg-surface-section font-semibold text-foreground'
                        : 'bg-surface text-muted'
                    )}
                  >
                    Side {i + 1}
                  </button>
                ))}
              </div>
              <div className="md:hidden">
                <ViewpointPanel
                  viewpoint={detail.viewpoints[activeVp]}
                  ordinal={activeVp + 1}
                  onOpenProposition={openProp}
                />
              </div>
              <div
                className={cn(
                  'hidden gap-4 md:grid',
                  detail.viewpoints.length === 1 && 'md:grid-cols-1',
                  detail.viewpoints.length === 2 && 'md:grid-cols-2',
                  detail.viewpoints.length === 3 && 'md:grid-cols-3',
                  detail.viewpoints.length >= 4 && 'md:grid-cols-2 xl:grid-cols-4'
                )}
              >
                {detail.viewpoints.map((vp, i) => (
                  <ViewpointPanel
                    key={vp.uid}
                    viewpoint={vp}
                    ordinal={i + 1}
                    onOpenProposition={openProp}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <AnalyzedCallout assessments={detail.assessments} />

        <ExplorePollPanel targetUid={detail.uid} isAuthenticated={isAuthenticated} />

        {detail.related.length > 0 ? (
          <section id="related" className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Related controversies
            </h2>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-3">
                {detail.related.map((item) => (
                  <div key={item.uid} className="w-[min(100%,20rem)] shrink-0 whitespace-normal">
                    <ControversyListRow item={item} />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Feedback on this debate
          </h2>
          {isAuthenticated ? (
            <div className="max-w-lg space-y-3">
              <Select value={feedbackReason} onValueChange={setFeedbackReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing_fact">Missing fact</SelectItem>
                  <SelectItem value="bad_representation">Bad representation</SelectItem>
                  <SelectItem value="weak_support">Weak support</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                value={feedbackDetail}
                onChange={(e) => setFeedbackDetail(e.target.value)}
                rows={3}
                placeholder="What should we revise?"
              />
              <Button variant="secondary" onClick={submitControversyFeedback}>
                Submit
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">Sign in to leave structured feedback.</p>
          )}
        </section>
      </div>

      <EvidenceSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        controversyUid={detail.uid}
        proposition={selectedProp}
        isAuthenticated={isAuthenticated}
      />
    </main>
  )
}
