'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PositionNarrativeArticle } from '@/components/position-narrative-article'
import { PositionDetailContent } from '@/components/position-detail-content'
import {
  PositionPopularitySnapshot,
  getPositionAgreementRank,
} from '@/components/position-popularity-snapshot'
import { useRegisterToc } from '@/components/topic-explore-context'
import { buildPositionTocSections, positionSectionId } from '@/lib/position-toc'
import { topicPath } from '@/lib/topic-routes'
import type { Position, Topic } from '@/lib/mock/topic-explore'

export function PositionExplorePage({
  topic,
  position,
}: {
  topic: Topic
  position: Position
}) {
  const pageTitle = position.narrative?.title ?? position.headline
  const sectionId = positionSectionId(position.id)

  const tocSections = useMemo(() => buildPositionTocSections(position), [position])
  const agreementRank = useMemo(
    () => getPositionAgreementRank(position.id, topic.positions),
    [position.id, topic.positions]
  )
  const introParagraphs =
    position.narrative?.intro ??
    (position.narrative ? [] : [position.description])

  useRegisterToc({
    backLink: { href: topicPath(topic.id), label: topic.title },
    sections: tocSections,
  })

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] min-w-0 overflow-x-hidden text-foreground">
      <div className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <Link
          href={topicPath(topic.id)}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          data-testid="position-back-link"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span>{topic.title}</span>
        </Link>

        <div data-testid="position-article-body">
          <h1
            id={`${sectionId}-title`}
            className="mb-4 scroll-mt-[calc(var(--header-height)+1rem)] text-2xl font-semibold tracking-tight text-foreground"
          >
            {pageTitle}
          </h1>

          <PositionPopularitySnapshot
            position={position}
            agreementRank={agreementRank}
            topicPositionCount={topic.positions.length}
          />

          {introParagraphs.map((paragraph, index) => (
            <p key={index} className="mb-4 text-sm leading-relaxed text-foreground/90">
              {paragraph}
            </p>
          ))}

          {position.narrative && (
            <PositionNarrativeArticle
              narrative={position.narrative}
              positionId={position.id}
              topic={topic}
            />
          )}
        </div>

        <PositionDetailContent position={position} />
      </div>
    </main>
  )
}
