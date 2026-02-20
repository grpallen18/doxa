'use client'

import { useEffect, useRef, useState } from 'react'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { Button as UiButton } from '@/components/ui/button'
import AtlasNodeTestCanvas from '@/components/atlas/AtlasNodeTestCanvas'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { VizNode, VizEdge, SourceDetail } from '@/components/atlas/types'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ExternalLinkIcon, Maximize2 } from 'lucide-react'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

function CollapsibleSection({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300',
        collapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100',
        className
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

interface VizMap {
  id: string
  name: string
  scope_type: string
  scope_id: string | null
  time_window_days: number | null
  created_at: string
}

export default function AtlasPage() {
  const [maps, setMaps] = useState<VizMap[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null)
  const [mapData, setMapData] = useState<{
    nodes: VizNode[]
    edges: VizEdge[]
    sourceDetails: SourceDetail[]
    thesisText: string | null
    viewpointText: string | null
  } | null>(null)
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null)
  const [expandedStoryKey, setExpandedStoryKey] = useState<string | null>(null)
  const [spotlightSourceId, setSpotlightSourceId] = useState<string | null>(null)
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Responsive: horizontal on desktop (>=768px), vertical on mobile
  const [isHorizontal, setIsHorizontal] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsHorizontal(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsHorizontal(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const ANIM_DURATION = 350
  function handleSourceChange(v: string | null) {
    const newValue = v || null
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current)
      animTimeoutRef.current = null
    }
    if (newValue) {
      setExpandedStoryKey(null)
      setSpotlightSourceId(newValue)
      setExpandedSourceId(null)
      animTimeoutRef.current = setTimeout(() => {
        setExpandedSourceId(newValue)
        animTimeoutRef.current = null
      }, ANIM_DURATION)
    } else {
      setExpandedSourceId(null)
      setExpandedStoryKey(null)
      animTimeoutRef.current = setTimeout(() => {
        setSpotlightSourceId(null)
        animTimeoutRef.current = null
      }, ANIM_DURATION)
    }
  }

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    fetch('/api/atlas/maps')
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) {
          setMaps(d.data)
          if (d.data.length > 0 && !selectedMapId) {
            setSelectedMapId(d.data[0].id)
          }
        }
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedMapId) {
      setMapData(null)
      return
    }
    setLoading(true)
    fetch(`/api/atlas/maps/${selectedMapId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) {
          setMapData({
            nodes: d.data.nodes ?? [],
            edges: d.data.edges ?? [],
            sourceDetails: d.data.sourceDetails ?? [],
            thesisText: d.data.thesisText ?? null,
            viewpointText: d.data.viewpointText ?? null,
          })
        } else {
          setMapData(null)
        }
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [selectedMapId])

  if (loading && maps.length === 0) {
    return (
      <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <LandingHeader variant="atlas" />
          <Panel variant="soft" className="flex min-h-[400px] items-center justify-center p-8">
            <div className="flex flex-col items-center gap-4">
              <div
                className="h-12 w-12 animate-spin rounded-full border-2 border-muted border-t-accent-primary"
                aria-hidden
              />
              <p className="text-sm text-muted">Loading atlas…</p>
            </div>
          </Panel>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <LandingHeader variant="atlas" />
          <Panel variant="soft" className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-sm text-foreground">Error: {error}</p>
            <Button onClick={() => window.location.reload()} variant="primary">
              Retry
            </Button>
          </Panel>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <LandingHeader variant="atlas" />

        <Panel variant="soft" interactive={false} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <h1 className="min-w-0 shrink-0 text-xl font-semibold tracking-tight">Living Atlas</h1>
          {maps.length > 0 && (
            <div className="min-w-0 flex-1 md:max-w-md">
              <select
                value={selectedMapId ?? ''}
                onChange={(e) => setSelectedMapId(e.target.value || null)}
                className="w-full min-w-0 rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-foreground"
              >
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Panel>

        <Panel variant="soft" interactive={false} className="overflow-hidden p-0">
          <ResizablePanelGroup orientation={isHorizontal ? 'horizontal' : 'vertical'}>
            <ResizablePanel defaultSize={20} minSize={10}>
              <AtlasNodeTestCanvas
                centerNode={mapData?.nodes.find((n) => n.entity_type === 'thesis' || n.entity_type === 'viewpoint') ?? null}
                sourceDetails={mapData?.sourceDetails ?? []}
                hoveredSourceId={
                  spotlightSourceId ?? expandedSourceId ?? hoveredSourceId
                }
                onHoveredSourceChange={setHoveredSourceId}
                onSourceSelect={(id) =>
                  handleSourceChange(id && id === expandedSourceId ? null : id)
                }
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={80} minSize={20}>
              <div
                  className={cn(
                    'flex h-full flex-col overflow-y-auto p-4 transition-[gap] duration-300',
                    spotlightSourceId ? 'gap-0' : 'gap-4'
                  )}
                >
                {(() => {
                  const centerNode = mapData?.nodes.find((n) => n.entity_type === 'thesis' || n.entity_type === 'viewpoint')
                  const selectedMap = maps.find((m) => m.id === selectedMapId)
                  if (!centerNode) {
                    return (
                      <p className="text-sm text-muted">Select a map to view details.</p>
                    )
                  }

                  const sources = mapData?.sourceDetails ?? []
                  const centerLabel = centerNode.entity_type === 'viewpoint' ? 'Viewpoint' : 'Thesis'
                  const centerText = mapData?.viewpointText ?? mapData?.thesisText ?? selectedMap?.name ?? centerNode.entity_id

                  return (
                    <>
                      <CollapsibleSection collapsed={!!spotlightSourceId}>
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">{centerLabel}</h2>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                            {centerText}
                          </p>
                        </div>
                      </CollapsibleSection>

                      <CollapsibleSection collapsed={!!spotlightSourceId}>
                        <h3 className="text-sm font-semibold text-foreground">
                          Sources ({sources.length})
                        </h3>
                      </CollapsibleSection>

                      <Accordion
                        type="single"
                        collapsible
                        value={expandedSourceId ?? ''}
                        onValueChange={(v) => handleSourceChange(v || null)}
                        className={cn('space-y-2', spotlightSourceId ? 'space-y-0' : '')}
                      >
                        {sources.map((src) => {
                          const highlightedSourceId =
                            spotlightSourceId ?? expandedSourceId ?? hoveredSourceId
                          const isHighlighted = highlightedSourceId === src.source_id
                          const isCollapsed = !!spotlightSourceId && spotlightSourceId !== src.source_id
                          return (
                            <CollapsibleSection key={src.source_id} collapsed={isCollapsed}>
                              <AccordionItem
                                value={src.source_id}
                                className={`rounded-md border px-3 transition-colors ${
                                  isHighlighted
                                    ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-soft)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-accordion)]'
                                }`}
                                onMouseEnter={() => setHoveredSourceId(src.source_id)}
                                onMouseLeave={() => setHoveredSourceId(null)}
                              >
                                <AccordionTrigger className="py-2 hover:no-underline hover:bg-transparent">
                                  <div className="flex flex-col items-start text-left">
                                    <span className="text-xs font-medium text-foreground">
                                      {src.source_name}
                                    </span>
                                    <span className="text-xs text-muted">
                                      {src.story_count} {src.story_count === 1 ? 'story' : 'stories'}
                                    </span>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="text-xs text-muted">
                                  <Accordion
                                    type="single"
                                    collapsible
                                    value={
                                      expandedStoryKey?.startsWith(src.source_id + '--')
                                        ? expandedStoryKey
                                        : ''
                                    }
                                    onValueChange={(v) => setExpandedStoryKey(v || null)}
                                    className="space-y-2"
                                  >
                                    {src.stories.map((story) => {
                                      const storyKey = `${src.source_id}--${story.story_id}`
                                      const isStorySpotlighted =
                                        expandedStoryKey?.startsWith(src.source_id + '--') ?? false
                                      const isThisStoryExpanded = expandedStoryKey === storyKey
                                      const isDimmed =
                                        isStorySpotlighted && !isThisStoryExpanded
                                      return (
                                        <AccordionItem
                                          key={story.story_id}
                                          value={storyKey}
                                          className={cn(
                                            'rounded border border-[var(--border-subtle)] bg-[var(--surface-accordion)] px-2 transition-opacity duration-300',
                                            isDimmed && 'opacity-50'
                                          )}
                                        >
                                          <AccordionTrigger className="py-2 hover:no-underline hover:bg-transparent">
                                            <div className="flex w-full items-center gap-2 text-left">
                                              {story.url && (
                                                <a
                                                  href={story.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="group shrink-0 rounded p-1 text-muted"
                                                  onClick={(e) => e.stopPropagation()}
                                                  aria-label="Open story link"
                                                >
                                                  <ExternalLinkIcon className="size-4 transition-transform duration-200 group-hover:scale-[1.2]" />
                                                </a>
                                              )}
                                              <span className="min-w-0 flex-1 font-medium text-foreground">
                                                {story.title ?? 'Untitled'}
                                              </span>
                                              {(story.content_clean || story.story_claims.length > 0) && (
                                                <Drawer>
                                                  <DrawerTrigger asChild>
                                                    <button
                                                      type="button"
                                                      className="shrink-0 rounded p-1 text-muted hover:bg-muted hover:text-foreground"
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                      aria-label="Expand full story"
                                                    >
                                                      <Maximize2 className="size-4" />
                                                    </button>
                                                  </DrawerTrigger>
                                                  <DrawerContent className="max-h-[85vh]">
                                                    <DrawerHeader>
                                                      <DrawerTitle>
                                                        {story.title ?? 'Untitled'}
                                                      </DrawerTitle>
                                                      {story.published_at && (
                                                        <p className="text-sm text-muted-foreground">
                                                          {new Date(
                                                            story.published_at
                                                          ).toLocaleDateString(
                                                            undefined,
                                                            {
                                                              year: 'numeric',
                                                              month: 'long',
                                                              day: 'numeric',
                                                            }
                                                          )}
                                                        </p>
                                                      )}
                                                    </DrawerHeader>
                                                    <div className="overflow-y-auto px-4 pb-4">
                                                      <div className="flex flex-col gap-1.5 pb-2 text-sm">
                                                        <Separator className="mb-1.5" />
                                                        <div className="leading-none font-medium text-foreground">
                                                          Key Claims
                                                        </div>
                                                        <ul className="list-disc space-y-1.5 pl-5 text-foreground">
                                                          {story.story_claims.map((sc) => (
                                                            <li key={sc.story_claim_id}>
                                                              {sc.raw_text ?? 'No claim text available'}
                                                            </li>
                                                          ))}
                                                        </ul>
                                                        {story.content_clean && (
                                                          <>
                                                            <Separator className="my-2" />
                                                            {story.published_at && (
                                                              <div className="mb-1.5 leading-none font-medium text-foreground">
                                                                {new Date(
                                                                  story.published_at
                                                                ).toLocaleDateString(undefined, {
                                                                  year: 'numeric',
                                                                  month: 'long',
                                                                  day: 'numeric',
                                                                })}
                                                              </div>
                                                            )}
                                                            <div className="whitespace-pre-wrap text-foreground">
                                                              {story.content_clean}
                                                            </div>
                                                          </>
                                                        )}
                                                      </div>
                                                    </div>
                                                    <div className="border-t px-4 py-3">
                                                      <DrawerClose asChild>
                                                        <UiButton variant="outline" size="sm">
                                                          Close
                                                        </UiButton>
                                                      </DrawerClose>
                                                    </div>
                                                  </DrawerContent>
                                                </Drawer>
                                              )}
                                            </div>
                                          </AccordionTrigger>
                                          <AccordionContent>
                                            <div className="max-h-72 overflow-y-auto pr-2">
                                              <div className="flex flex-col gap-1.5 pb-2 text-sm">
                                                <Separator className="mb-1.5" />
                                                <div className="leading-none font-medium text-foreground">
                                                  Key Claims
                                                </div>
                                                <ul className="list-disc space-y-1.5 pl-5 text-foreground">
                                                  {story.story_claims.map((sc) => (
                                                    <li key={sc.story_claim_id}>
                                                      {sc.raw_text ?? 'No claim text available'}
                                                    </li>
                                                  ))}
                                                </ul>
                                                {story.content_clean && (
                                                  <>
                                                    <Separator className="my-2" />
                                                    {story.published_at && (
                                                      <div className="mb-1.5 leading-none font-medium text-foreground">
                                                        {new Date(
                                                          story.published_at
                                                        ).toLocaleDateString(undefined, {
                                                          year: 'numeric',
                                                          month: 'long',
                                                          day: 'numeric',
                                                        })}
                                                      </div>
                                                    )}
                                                    <div className="whitespace-pre-wrap text-foreground">
                                                      {story.content_clean}
                                                    </div>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </AccordionContent>
                                        </AccordionItem>
                                      )
                                    })}
                                  </Accordion>
                                </AccordionContent>
                              </AccordionItem>
                            </CollapsibleSection>
                          )
                        })}
                      </Accordion>
                    </>
                  )
                })()}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </Panel>
      </div>
    </main>
  )
}
