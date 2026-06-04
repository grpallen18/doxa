'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { TopicHeader } from '@/components/topic-header'
import { PositionWikiSections } from '@/components/position-wiki-sections'
import { getTopicById } from '@/lib/mock/topic-explore'

export function TopicExploreHome() {
  return (
    <Suspense fallback={null}>
      <TopicExploreHomeInner />
    </Suspense>
  )
}

function TopicExploreHomeInner() {
  const searchParams = useSearchParams()
  const topic = getTopicById(searchParams.get('topic'))

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] min-w-0 overflow-x-hidden text-foreground">
      <div className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <TopicHeader topic={topic} />
        <PositionWikiSections positions={topic.positions} />
      </div>
    </main>
  )
}
