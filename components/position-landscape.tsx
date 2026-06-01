'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PositionCard } from '@/components/position-card'
import { cn } from '@/lib/utils'
import type { Position } from '@/lib/mock/topic-explore'

const VISIBLE_COUNT = 3
const GAP_PX = 12
const SLIDE_MS = 340
const BOUNCE_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

export function PositionLandscape({
  positions,
  selectedId,
  onSelect,
}: {
  positions: Position[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [cardWidth, setCardWidth] = useState(0)
  const n = positions.length
  const showArrows = n > VISIBLE_COUNT

  const loopPositions = useMemo(
    () => (showArrows ? [...positions, ...positions, ...positions] : positions),
    [positions, showArrows]
  )

  const [index, setIndex] = useState(showArrows ? n : 0)
  const [transitionEnabled, setTransitionEnabled] = useState(true)

  useEffect(() => {
    if (!showArrows) return
    setIndex(n)
    setTransitionEnabled(true)
  }, [n, showArrows, positions])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const count = Math.min(VISIBLE_COUNT, n)
      setCardWidth((w - GAP_PX * (count - 1)) / count)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [n])

  const snapIndex = useCallback(
    (i: number) => {
      if (!showArrows) return
      if (i >= 2 * n) {
        setTransitionEnabled(false)
        setIndex(i - n)
      } else if (i < n) {
        setTransitionEnabled(false)
        setIndex(i + n)
      }
    },
    [n, showArrows]
  )

  useEffect(() => {
    if (transitionEnabled) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionEnabled(true))
    })
    return () => cancelAnimationFrame(id)
  }, [transitionEnabled, index])

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return
    snapIndex(index)
  }

  const go = useCallback(
    (delta: number) => {
      if (!showArrows) return
      setTransitionEnabled(true)
      setIndex((i) => i + delta)
    },
    [showArrows]
  )

  const step = cardWidth + GAP_PX
  const translateX = showArrows && cardWidth > 0 ? -(index * step) : 0
  const visibleSlots = Math.min(VISIBLE_COUNT, n)

  return (
    <section aria-label="Main positions" className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Positions</h2>

      <div className="flex items-stretch gap-2">
        {showArrows && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous positions"
            className={cn(
              'flex shrink-0 items-center justify-center self-center rounded-md border border-subtle',
              'bg-surface p-2 text-muted transition-colors hover:bg-surface-soft hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <ChevronLeft className="size-5" />
          </button>
        )}

        <div
          ref={viewportRef}
          data-testid="position-carousel"
          className="min-w-0 flex-1 overflow-hidden"
        >
          <div
            className="flex"
            onTransitionEnd={handleTransitionEnd}
            style={{
              gap: GAP_PX,
              transform: `translateX(${translateX}px)`,
              transition: transitionEnabled ? `transform ${SLIDE_MS}ms ${BOUNCE_EASE}` : 'none',
            }}
          >
            {loopPositions.map((position, i) => (
              <div
                key={`${i}-${position.id}`}
                className="min-w-0 shrink-0 overflow-hidden"
                style={{ width: cardWidth > 0 ? cardWidth : `${100 / visibleSlots}%` }}
              >
                <PositionCard
                  position={position}
                  selected={position.id === selectedId}
                  onSelect={onSelect}
                />
              </div>
            ))}
          </div>
        </div>

        {showArrows && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next positions"
            className={cn(
              'flex shrink-0 items-center justify-center self-center rounded-md border border-subtle',
              'bg-surface p-2 text-muted transition-colors hover:bg-surface-soft hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
    </section>
  )
}
