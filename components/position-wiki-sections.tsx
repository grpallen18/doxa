'use client'

import { useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PositionAgreementMeter } from '@/components/position-agreement-meter'
import { useTopicExplore } from '@/components/topic-explore-context'
import { cn } from '@/lib/utils'
import { positionAccentVar } from '@/lib/topic-explore-ui'
import type { Position, RelatedControversy, SupportingClaim } from '@/lib/mock/topic-explore'

function WikiSubheading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      className="scroll-mt-[calc(var(--header-height)+1rem)] border-b border-subtle pb-1 text-sm font-semibold text-foreground"
    >
      {children}
    </h3>
  )
}

function ClaimList({ claims, accent }: { claims: SupportingClaim[]; accent: string }) {
  return (
    <ul className="space-y-2">
      {claims.map((claim) => (
        <li
          key={claim.id}
          className="space-y-1.5 rounded-md border border-subtle bg-surface px-3 py-2.5"
        >
          <p className="text-sm leading-relaxed text-foreground">{claim.text}</p>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="tabular-nums">{claim.agreement}% agree</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{claim.sources.toLocaleString()} sources</span>
            <div className="ml-auto h-1 w-16 overflow-hidden rounded-full bg-muted/30">
              <div
                className="h-full rounded-full"
                style={{ width: `${claim.agreement}%`, backgroundColor: accent }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ControversyList({ items }: { items: RelatedControversy[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-md border border-subtle bg-surface px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 text-sm text-foreground">{item.title}</span>
          <span className="shrink-0 text-xs uppercase tracking-wide text-muted">{item.impact}</span>
        </li>
      ))}
    </ul>
  )
}

function PositionWikiSection({ position }: { position: Position }) {
  const explore = useTopicExplore()
  const isCollapsed = explore?.isCollapsed ?? (() => false)
  const setSectionCollapsed = explore?.setSectionCollapsed
  const sectionId = `position-${position.id}`
  const open = !isCollapsed(sectionId)
  const accent = positionAccentVar(position.ordinal)

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setSectionCollapsed?.(sectionId, !next)}
    >
      <section
        id={sectionId}
        aria-labelledby={`${sectionId}-heading`}
        className={cn(
          'scroll-mt-[calc(var(--header-height)+1rem)] border-b transition-[border-color] duration-300 ease-out',
          open ? 'border-transparent pb-6' : 'border-subtle pb-0'
        )}
        data-testid="position-wiki-section"
      >
        <div
          className={cn(
            'border-b transition-[border-color] duration-300 ease-out',
            open ? 'border-foreground' : 'border-transparent'
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'group flex w-full items-center gap-2 py-2 text-left',
                'rounded-md transition-colors hover:bg-surface-soft',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted transition-transform duration-300 ease-out',
                  open && 'rotate-180'
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <h2
                  id={`${sectionId}-heading`}
                  className="text-sm font-semibold leading-snug text-foreground sm:text-base"
                >
                  {position.headline}
                </h2>
              </span>
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="space-y-6 pb-2 pl-6 pt-4">
            <p className="text-sm leading-relaxed text-foreground/90">{position.description}</p>

            <div className="max-w-md space-y-2">
              <WikiSubheading id={`${sectionId}-agreement`}>Agreement</WikiSubheading>
              <PositionAgreementMeter percent={position.agreementPct} />
              <p className="text-xs text-muted">
                Republican {position.partyAgreement.republican}% · Democrat{' '}
                {position.partyAgreement.democrat}%
              </p>
            </div>

            <div className="space-y-3">
              <WikiSubheading id={`${sectionId}-supporting`}>Key supporting claims</WikiSubheading>
              <ClaimList claims={position.supportingClaims} accent={accent} />
            </div>

            <div className="space-y-3">
              <WikiSubheading id={`${sectionId}-opposing`}>Top opposing claims</WikiSubheading>
              <ClaimList claims={position.opposingClaims} accent="var(--muted-soft)" />
            </div>

            <div className="space-y-3">
              <WikiSubheading id={`${sectionId}-controversies`}>Related controversies</WikiSubheading>
              <ControversyList items={position.relatedControversies} />
            </div>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

export function PositionWikiSections({ positions }: { positions: Position[] }) {
  const explore = useTopicExplore()
  const observerRef = useRef<IntersectionObserver | null>(null)
  const setSections = explore?.setSections
  const expandAll = explore?.expandAll
  const setActiveSectionId = explore?.setActiveSectionId

  useEffect(() => {
    if (!setSections || !expandAll || !setActiveSectionId) return

    setSections(
      positions.map((position) => ({
        id: `position-${position.id}`,
        title: position.headline,
      }))
    )
    expandAll()

    return () => {
      setSections([])
      setActiveSectionId(null)
    }
  }, [positions, setSections, expandAll, setActiveSectionId])

  useEffect(() => {
    if (!setActiveSectionId) return

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target.id) {
          setActiveSectionId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    )

    for (const position of positions) {
      const el = document.getElementById(`position-${position.id}`)
      if (el) observerRef.current?.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [positions, setActiveSectionId])

  return (
    <div aria-label="Topic positions" className="space-y-1" data-testid="position-wiki-sections">
      {positions.map((position) => (
        <PositionWikiSection key={position.id} position={position} />
      ))}
    </div>
  )
}
