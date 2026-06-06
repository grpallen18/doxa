'use client'

import { PositionLinkList } from '@/components/position-link-list'
import type { Topic } from '@/lib/mock/topic-explore'

export function PositionTopicList({ topic }: { topic: Topic }) {
  return (
    <div aria-label="Topic positions" className="space-y-1" data-testid="position-topic-list">
      <h2
        id="topic-positions"
        className="scroll-mt-[calc(var(--header-height)+1rem)] text-sm font-semibold uppercase tracking-wide text-muted"
      >
        Positions
      </h2>
      <PositionLinkList topic={topic} positions={topic.positions} />
    </div>
  )
}
