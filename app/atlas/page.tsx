'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { Button as UiButton } from '@/components/ui/button'
import AtlasNodeTestCanvas from '@/components/atlas/AtlasNodeTestCanvas'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { SourceDetail, ViewpointDetail, ControversyDetail, PositionDetail, ClaimDetail } from '@/components/atlas/types'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ExternalLinkIcon, Maximize2, ChevronUp } from 'lucide-react'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  SCOPE_LAYERS,
  type ScopeType,
} from '@/lib/atlas/scope-registry'
import type { ScopeResponse } from '@/lib/atlas/types'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/ui/sidebar'

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

interface ScopeFrame {
  type: ScopeType
  id: string
  label?: string
}

interface AgreementItem {
  agreement_cluster_id: string
  label: string | null
  summary: string | null
  position_count: number
}

export default function AtlasPage() {
  const [agreements, setAgreements] = useState<AgreementItem[]>([])
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null)
  const [scopeStack, setScopeStack] = useState<ScopeFrame[]>([])
  const [zoomOutTarget, setZoomOutTarget] = useState<ScopeFrame | null>(null)
  const [mapData, setMapData] = useState<ScopeResponse | null>(null)
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null)
  const [expandedStoryKey, setExpandedStoryKey] = useState<string | null>(null)
  const [spotlightSourceId, setSpotlightSourceId] = useState<string | null>(null)
  const [hoveredOuterId, setHoveredOuterId] = useState<string | null>(null)
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchedPromiseRef = useRef<Promise<ScopeResponse> | null>(null)
  const prefetchedEntityIdRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ANIM_DURATION = 350
  const handleSourceChange = useCallback((v: string | null) => {
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
  }, [])

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current)
    }
  }, [])

  const loadScope = useCallback(async (type: ScopeType, id: string, options?: { pushToStack?: boolean; replaceStack?: boolean }) => {
    const layer = SCOPE_LAYERS[type]
    if (!layer) return
    prefetchedEntityIdRef.current = null
    prefetchedPromiseRef.current = null
    setLoading(true)
    try {
      const data = await layer.fetchScope(id)
      setMapData(data)
      const label = (data.centerDescription ?? (type === 'agreement' ? 'Agreement' : type === 'position' ? 'Position' : type === 'topic' ? 'Topic' : type === 'viewpoint' ? 'Viewpoint' : 'Controversy')).slice(0, 40)
      if (options?.replaceStack) {
        setScopeStack([{ type, id, label }])
      } else if (options?.pushToStack !== false) {
        setScopeStack((prev) => [...prev, { type, id, label }])
      }
      // When pushToStack is false and replaceStack is false (breadcrumb), caller already set the stack
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAgreements = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/atlas/agreements')
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json?.error?.message ?? 'Failed to load agreements')
        setAgreements([])
        return
      }
      const items = json.data?.items ?? []
      setAgreements(items)
      if (items.length > 0 && !selectedAgreementId) {
        const first = items[0]
        setSelectedAgreementId(first.agreement_cluster_id)
        await loadScope('agreement', first.agreement_cluster_id, { pushToStack: false, replaceStack: true })
      } else if (selectedAgreementId && items.some((a: AgreementItem) => a.agreement_cluster_id === selectedAgreementId)) {
        await loadScope('agreement', selectedAgreementId, { pushToStack: false, replaceStack: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [loadScope, selectedAgreementId])

  useEffect(() => {
    loadAgreements()
  }, [])

  const handleAgreementSelect = useCallback(
    async (agreementId: string) => {
      setSelectedAgreementId(agreementId)
      await loadScope('agreement', agreementId, { pushToStack: false, replaceStack: true })
    },
    [loadScope]
  )

  const handleDrillPrepare = useCallback(
    (entityType: string, entityId: string) => {
      const currentScope = scopeStack[scopeStack.length - 1]
      const layer = currentScope ? SCOPE_LAYERS[currentScope.type] : null
      if (!layer || !layer.isDrillable) return
      const matchesPosition = entityType === 'position' && layer.outerEntityType === 'position'
      const matchesViewpoint = entityType === 'viewpoint' && layer.outerEntityType === 'viewpoint'
      const matchesControversy = entityType === 'controversy' && layer.outerEntityType === 'controversy'
      if (!matchesPosition && !matchesViewpoint && !matchesControversy) return
      const targetLayer = SCOPE_LAYERS[entityType as ScopeType]
      if (!targetLayer) return
      prefetchedEntityIdRef.current = entityId
      prefetchedPromiseRef.current = targetLayer.fetchScope(entityId)
    },
    [scopeStack]
  )

  const handleOuterNodeClick = useCallback(
    async (entityType: string, entityId: string) => {
      const currentScope = scopeStack[scopeStack.length - 1]
      const layer = currentScope ? SCOPE_LAYERS[currentScope.type] : null
      if (!layer) return
      if (entityType === 'position' && layer.isDrillable && layer.outerEntityType === 'position') {
        if (prefetchedEntityIdRef.current === entityId && prefetchedPromiseRef.current) {
          try {
            const data = await prefetchedPromiseRef.current
            setMapData(data)
            const label = (data.centerDescription ?? 'Position').slice(0, 40)
            setScopeStack((prev) => [...prev, { type: 'position' as ScopeType, id: entityId, label }])
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load')
          } finally {
            prefetchedEntityIdRef.current = null
            prefetchedPromiseRef.current = null
          }
        } else {
          await loadScope('position', entityId)
        }
      } else if (entityType === 'controversy' && layer.isDrillable && layer.outerEntityType === 'controversy') {
        if (prefetchedEntityIdRef.current === entityId && prefetchedPromiseRef.current) {
          try {
            const data = await prefetchedPromiseRef.current
            setMapData(data)
            const label = (data.centerDescription ?? 'Controversy').slice(0, 40)
            setScopeStack((prev) => [...prev, { type: 'controversy' as ScopeType, id: entityId, label }])
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load')
          } finally {
            prefetchedEntityIdRef.current = null
            prefetchedPromiseRef.current = null
          }
        } else {
          await loadScope('controversy', entityId)
        }
      } else if (entityType === 'viewpoint' && layer.isDrillable && layer.outerEntityType === 'viewpoint') {
        if (prefetchedEntityIdRef.current === entityId && prefetchedPromiseRef.current) {
          try {
            const data = await prefetchedPromiseRef.current
            setMapData(data)
            const label = (data.centerDescription ?? 'Viewpoint').slice(0, 40)
            setScopeStack((prev) => [...prev, { type: 'viewpoint' as ScopeType, id: entityId, label }])
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load')
          } finally {
            prefetchedEntityIdRef.current = null
            prefetchedPromiseRef.current = null
          }
        } else {
          await loadScope('viewpoint', entityId)
        }
      } else if (entityType === 'source' && layer.outerEntityType === 'source') {
        handleSourceChange(entityId === expandedSourceId ? null : entityId)
      }
      // claim: leaf, no drill; highlight in panel via hoveredOuterId (already set by canvas)
    },
    [scopeStack, loadScope, expandedSourceId, handleSourceChange]
  )

  const handleZoomOutComplete = useCallback(() => {
    const target = zoomOutTarget
    setZoomOutTarget(null)
    if (!target) return
    setScopeStack((prev) => {
      const idx = prev.findIndex((f) => f.type === target.type && f.id === target.id)
      return idx >= 0 ? prev.slice(0, idx + 1) : prev
    })
    loadScope(target.type, target.id, { pushToStack: false, replaceStack: false })
  }, [zoomOutTarget, loadScope])

  const handleZoomOut = useCallback(() => {
    if (scopeStack.length <= 1) return
    const parent = scopeStack[scopeStack.length - 2]
    if (parent) setZoomOutTarget(parent)
  }, [scopeStack])

  if (loading && !mapData) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] flex-1 flex-col text-foreground">
        <div className="flex flex-1 items-center justify-center p-8">
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
      </div>
    )
  }

  if (!loading && agreements.length === 0 && !mapData) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] flex-1 flex-col text-foreground">
        <div className="flex flex-1 items-center justify-center p-8">
          <Panel variant="soft" className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center max-w-md">
            <p className="text-sm text-foreground">
              No agreement clusters yet. Run the clustering pipeline to populate.
            </p>
            <Button onClick={() => loadAgreements()} variant="primary">
              Retry
            </Button>
          </Panel>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-var(--header-height))] flex-1 flex-col text-foreground">
        <div className="flex flex-1 items-center justify-center p-8">
          <Panel variant="soft" className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-sm text-foreground">Error: {error}</p>
            <Button onClick={() => window.location.reload()} variant="primary">
              Retry
            </Button>
          </Panel>
        </div>
      </div>
    )
  }

  const currentScope = scopeStack[scopeStack.length - 1]
  const currentLayer = currentScope ? SCOPE_LAYERS[currentScope.type] : null
  const outerEntityType = currentLayer?.outerEntityType ?? 'source'

  /** Right sidebar content: summary, positions/claims/controversies/viewpoints/sources */
  const rightSidebarContent = (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          {!mapData
            ? 'Details'
            : outerEntityType === 'position'
              ? `Positions (${mapData.positionDetails?.length ?? 0})`
              : outerEntityType === 'claim'
                ? `Claims (${mapData.claimDetails?.length ?? 0})`
                : outerEntityType === 'controversy'
                  ? `Controversies (${mapData.controversyDetails?.length ?? 0})`
                  : outerEntityType === 'viewpoint'
                    ? `Viewpoints (${mapData.viewpointDetails?.length ?? 0})`
                    : `Sources (${mapData.sourceDetails?.length ?? 0})`}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          {!mapData ? (
            <p className="text-sm text-muted">Select a scope to view details.</p>
          ) : outerEntityType === 'position' ? (
            <PositionsPanel
              positionDetails={mapData.positionDetails ?? []}
              hoveredOuterId={hoveredOuterId}
              onHoveredOuterChange={setHoveredOuterId}
              onPositionClick={(id) => handleOuterNodeClick('position', id)}
            />
          ) : outerEntityType === 'claim' ? (
            <ClaimsPanel
              claimDetails={mapData.claimDetails ?? []}
              hoveredOuterId={hoveredOuterId}
              onHoveredOuterChange={setHoveredOuterId}
            />
          ) : outerEntityType === 'controversy' ? (
            <ControversiesPanel
              controversyDetails={mapData.controversyDetails ?? []}
              hoveredOuterId={hoveredOuterId}
              onHoveredOuterChange={setHoveredOuterId}
              onControversyClick={(id) => handleOuterNodeClick('controversy', id)}
            />
          ) : outerEntityType === 'viewpoint' ? (
            <ViewpointsPanel
              viewpointDetails={mapData.viewpointDetails ?? []}
              hoveredOuterId={hoveredOuterId}
              onHoveredOuterChange={setHoveredOuterId}
              onViewpointClick={(id) => handleOuterNodeClick('viewpoint', id)}
              spotlightSourceId={spotlightSourceId}
            />
          ) : (
            <SourcesPanel
              sourceDetails={mapData.sourceDetails ?? []}
              expandedSourceId={expandedSourceId}
              expandedStoryKey={expandedStoryKey}
              spotlightSourceId={spotlightSourceId}
              hoveredOuterId={hoveredOuterId}
              onSourceChange={handleSourceChange}
              onStoryKeyChange={setExpandedStoryKey}
              onHoveredOuterChange={setHoveredOuterId}
            />
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )

  return (
    <div className="flex min-h-[calc(100vh-var(--header-height))] flex-1 flex-col text-foreground">
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 flex-1 flex-col gap-2 p-4">
          <div className="absolute left-6 top-6 z-20 flex flex-row items-center gap-2">
            {agreements.length > 0 && (
              <select
                value={selectedAgreementId ?? ''}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) handleAgreementSelect(id)
                }}
                className="rounded-md border border-[var(--border-subtle)] bg-background/80 px-3 py-2 text-sm text-foreground shadow-sm"
              >
                {agreements.map((a) => (
                  <option key={a.agreement_cluster_id} value={a.agreement_cluster_id}>
                    {(a.label || a.summary || 'Agreement')?.slice(0, 50)}
                    {a.position_count > 0 ? ` (${a.position_count})` : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={scopeStack.length > 1 ? handleZoomOut : undefined}
              disabled={scopeStack.length <= 1}
              className={cn(
                'flex size-9 items-center justify-center rounded-md border bg-background/80 shadow-sm transition-opacity',
                scopeStack.length <= 1
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-muted'
              )}
              aria-label="Zoom out"
            >
              <ChevronUp className="size-5" />
            </button>
          </div>
          <AtlasNodeTestCanvas
            className="shrink-0"
            centerNode={mapData?.centerNode ?? null}
            outerNodes={mapData?.outerNodes ?? []}
            hoveredOuterId={spotlightSourceId ?? expandedSourceId ?? hoveredOuterId}
            onHoveredOuterChange={setHoveredOuterId}
            onOuterNodeClick={handleOuterNodeClick}
            onDrillPrepare={handleDrillPrepare}
            pendingZoomOut={!!zoomOutTarget}
            onZoomOutComplete={handleZoomOutComplete}
          />
          {mapData?.centerNode && mapData.centerDescription && (
            <p
              key={mapData.centerNode.entity_id}
              className="whitespace-pre-wrap text-sm text-muted animate-in fade-in duration-1000"
            >
              {mapData.centerDescription}
            </p>
          )}
        </div>

        <Sidebar side="right" collapsible="none" className="border-l border-sidebar-border">
          <SidebarContent
            className={cn(
              'flex flex-col gap-4 pt-4 transition-[gap] duration-300',
              spotlightSourceId ? 'gap-0' : 'gap-4'
            )}
          >
            {rightSidebarContent}
          </SidebarContent>
        </Sidebar>
      </div>
    </div>
  )
}

function PositionsPanel({
  positionDetails,
  hoveredOuterId,
  onHoveredOuterChange,
  onPositionClick,
}: {
  positionDetails: PositionDetail[]
  hoveredOuterId: string | null
  onHoveredOuterChange: (id: string | null) => void
  onPositionClick: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {positionDetails.map((p) => {
        const isHighlighted = hoveredOuterId === p.canonical_position_id
        return (
          <button
            key={p.canonical_position_id}
            type="button"
            onClick={() => onPositionClick(p.canonical_position_id)}
            onMouseEnter={() => onHoveredOuterChange(p.canonical_position_id)}
            onMouseLeave={() => onHoveredOuterChange(null)}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-left transition-colors',
              isHighlighted
                ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-soft)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-accordion)] hover:border-[var(--border-subtle)]'
            )}
          >
            <p className="line-clamp-3 text-xs text-foreground">
              {p.canonical_text || 'Position'}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function ClaimsPanel({
  claimDetails,
  hoveredOuterId,
  onHoveredOuterChange,
}: {
  claimDetails: ClaimDetail[]
  hoveredOuterId: string | null
  onHoveredOuterChange: (id: string | null) => void
}) {
  return (
    <div className="space-y-2">
      {claimDetails.map((c) => {
        const isHighlighted = hoveredOuterId === c.claim_id
        return (
          <div
            key={c.claim_id}
            onMouseEnter={() => onHoveredOuterChange(c.claim_id)}
            onMouseLeave={() => onHoveredOuterChange(null)}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-left transition-colors',
              isHighlighted
                ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-soft)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-accordion)]'
            )}
          >
            <p className="line-clamp-3 text-xs text-foreground">
              {c.raw_text || 'Claim'}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ControversiesPanel({
  controversyDetails,
  hoveredOuterId,
  onHoveredOuterChange,
  onControversyClick,
}: {
  controversyDetails: ControversyDetail[]
  hoveredOuterId: string | null
  onHoveredOuterChange: (id: string | null) => void
  onControversyClick: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {controversyDetails.map((c) => {
        const isHighlighted = hoveredOuterId === c.controversy_cluster_id
        return (
          <button
            key={c.controversy_cluster_id}
            type="button"
            onClick={() => onControversyClick(c.controversy_cluster_id)}
            onMouseEnter={() => onHoveredOuterChange(c.controversy_cluster_id)}
            onMouseLeave={() => onHoveredOuterChange(null)}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-left transition-colors',
              isHighlighted
                ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-soft)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-accordion)] hover:border-[var(--border-subtle)]'
            )}
          >
            <span className="text-xs font-medium text-foreground">
              {c.question || 'Controversy'}
            </span>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{c.summary}</p>
          </button>
        )
      })}
    </div>
  )
}

function ViewpointsPanel({
  viewpointDetails,
  hoveredOuterId,
  onHoveredOuterChange,
  onViewpointClick,
  spotlightSourceId,
}: {
  viewpointDetails: ViewpointDetail[]
  hoveredOuterId: string | null
  onHoveredOuterChange: (id: string | null) => void
  onViewpointClick: (id: string) => void
  spotlightSourceId: string | null
}) {
  return (
    <>
      <CollapsibleSection collapsed={!!spotlightSourceId}>
        <div className="h-2" />
      </CollapsibleSection>
      <div className="space-y-2">
        {viewpointDetails.map((vp) => {
          const isHighlighted = hoveredOuterId === vp.viewpoint_id
          return (
            <button
              key={vp.viewpoint_id}
              type="button"
              onClick={() => onViewpointClick(vp.viewpoint_id)}
              onMouseEnter={() => onHoveredOuterChange(vp.viewpoint_id)}
              onMouseLeave={() => onHoveredOuterChange(null)}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left transition-colors',
                isHighlighted
                  ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-soft)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-accordion)] hover:border-[var(--border-subtle)]'
              )}
            >
              <span className="text-xs font-medium text-foreground">
                {vp.title || 'Viewpoint'}
              </span>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{vp.summary}</p>
            </button>
          )
        })}
      </div>
    </>
  )
}

function SourcesPanel({
  sourceDetails,
  expandedSourceId,
  expandedStoryKey,
  spotlightSourceId,
  hoveredOuterId,
  onSourceChange,
  onStoryKeyChange,
  onHoveredOuterChange,
}: {
  sourceDetails: SourceDetail[]
  expandedSourceId: string | null
  expandedStoryKey: string | null
  spotlightSourceId: string | null
  hoveredOuterId: string | null
  onSourceChange: (id: string | null) => void
  onStoryKeyChange: (key: string | null) => void
  onHoveredOuterChange: (id: string | null) => void
}) {
  return (
    <>
      <CollapsibleSection collapsed={!!spotlightSourceId}>
        <div className="h-2" />
      </CollapsibleSection>
      <Accordion
        type="single"
        collapsible
        value={expandedSourceId ?? ''}
        onValueChange={(v) => onSourceChange(v || null)}
        className={cn('space-y-2', spotlightSourceId ? 'space-y-0' : '')}
      >
        {sourceDetails.map((src) => {
          const highlightedSourceId = spotlightSourceId ?? expandedSourceId ?? hoveredOuterId
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
                onMouseEnter={() => onHoveredOuterChange(src.source_id)}
                onMouseLeave={() => onHoveredOuterChange(null)}
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
                    onValueChange={(v) => onStoryKeyChange(v || null)}
                    className="space-y-2"
                  >
                    {src.stories.map((story) => {
                      const storyKey = `${src.source_id}--${story.story_id}`
                      const isStorySpotlighted =
                        expandedStoryKey?.startsWith(src.source_id + '--') ?? false
                      const isThisStoryExpanded = expandedStoryKey === storyKey
                      const isDimmed = isStorySpotlighted && !isThisStoryExpanded
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
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label="Expand full story"
                                    >
                                      <Maximize2 className="size-4" />
                                    </button>
                                  </DrawerTrigger>
                                  <DrawerContent className="max-h-[85vh]">
                                    <DrawerHeader>
                                      <DrawerTitle>{story.title ?? 'Untitled'}</DrawerTitle>
                                      {story.published_at && (
                                        <p className="text-sm text-muted-foreground">
                                          {new Date(story.published_at).toLocaleDateString(
                                            undefined,
                                            { year: 'numeric', month: 'long', day: 'numeric' }
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
                                                {new Date(story.published_at).toLocaleDateString(
                                                  undefined,
                                                  { year: 'numeric', month: 'long', day: 'numeric' }
                                                )}
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
                                        {new Date(story.published_at).toLocaleDateString(
                                          undefined,
                                          { year: 'numeric', month: 'long', day: 'numeric' }
                                        )}
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
}
