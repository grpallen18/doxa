'use client'

import { useMemo } from 'react'
import { TopicHeader } from '@/components/topic-header'
import { TopicSummary } from '@/components/topic-summary'
import { PositionTopicList } from '@/components/position-topic-list'
import { useRegisterToc } from '@/components/topic-explore-context'
import { positionPath } from '@/lib/topic-routes'
import type { Topic } from '@/lib/mock/topic-explore'

export function TopicExplorePage({ topic }: { topic: Topic }) {
  const tocSections = useMemo(
    () => [
      { id: `topic-${topic.id}`, title: topic.title },
      { id: 'topic-positions', title: 'Positions' },
      ...topic.positions.map((position) => ({
        id: `topic-position-${position.id}`,
        title: position.headline,
        href: positionPath(topic.id, position.id),
      })),
    ],
    [topic]
  )

  useRegisterToc({ sections: tocSections })

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] min-w-0 overflow-x-hidden text-foreground">
      <div className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <TopicHeader topic={topic} />
        <TopicSummary topic={topic} />
        <PositionTopicList topic={topic} />
      </div>
    </main>
  )
}
