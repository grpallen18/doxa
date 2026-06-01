'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { TopicHeader } from '@/components/topic-header'
import { TopicBriefPanel } from '@/components/topic-brief-panel'
import { PositionLandscape } from '@/components/position-landscape'
import { SourceDiversityGrid } from '@/components/source-diversity-grid'
import { DiscourseEvolutionChart } from '@/components/discourse-evolution-chart'
import { PositionDetailPanel } from '@/components/position-detail-panel'
import { getPositionById, getTopicById } from '@/lib/mock/topic-explore'
import { cn } from '@/lib/utils'

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    setSelectedId(null)
  }, [topic.id])

  const selectedPosition = getPositionById(topic, selectedId)

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] min-w-0 overflow-x-hidden text-foreground">
      <div
        className={cn(
          'grid min-w-0',
          selectedPosition && 'lg:grid-cols-[minmax(0,1fr)_min(360px,32vw)]'
        )}
      >
        <div className="min-w-0 space-y-8 px-4 py-6 sm:px-6 lg:px-8">
          <TopicHeader topic={topic} />
          <TopicBriefPanel topic={topic} />
          <PositionLandscape
            positions={topic.positions}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <SourceDiversityGrid topic={topic} />
            <DiscourseEvolutionChart topic={topic} />
          </div>
        </div>

        {selectedPosition && (
          <aside className="hidden min-w-0 border-l border-subtle bg-surface-section lg:block">
            <div className="sticky top-[--header-height] h-[calc(100svh-var(--header-height))] overflow-hidden">
              <PositionDetailPanel
                position={selectedPosition}
                onClose={() => setSelectedId(null)}
              />
            </div>
          </aside>
        )}
      </div>

      <Sheet
        open={!isDesktop && !!selectedPosition}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Position detail</SheetTitle>
          {selectedPosition && (
            <PositionDetailPanel
              position={selectedPosition}
              onClose={() => setSelectedId(null)}
              hideClose
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  )
}
