'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  derivePipelineChecklist,
  deriveStageSummaries,
  EXTRACTION_TIMELINE_HIDDEN_STEPS,
  extractTimelineDetail,
  getExtractTimelineStatus,
  getMergeTimelineStatus,
  getQualifyTimelineStatus,
  mergeTimelineDetail,
  type PipelineStepState,
  type PipelineStepStatus,
  type StageSummary,
  type StageSummaryStatus,
} from '@/lib/admin/pipeline-status'
import {
  PipelineStepNode,
  pipelineNodeTrackClass,
} from '@/components/admin/pipeline/pipeline-step-node'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const TRACK_ROW_HEIGHT = 'h-7'
const TRACK_TOP = 'calc(0.125rem + 0.875rem)'

const TIMELINE_HIDDEN_STEPS = new Set<PipelineStepId>([
  'review-pending-stories',
  ...EXTRACTION_TIMELINE_HIDDEN_STEPS,
])

const SUBSTAGE_SHORT_LABEL: Partial<Record<PipelineStepId, string>> = {
  'relevance-gate': 'Qualify',
  'scrape-story-content': 'Scrape',
  'clean-scraped-content': 'Clean',
  'chunk-story-bodies': 'Chunk',
  'extract-story-claims': 'Extract',
  'link-canonical-claims': 'Claims',
  'link-canonical-events': 'Events',
  'link-canonical-positions': 'Positions',
  'update-stances': 'Stances',
}

const STAGE_COLUMN_MIN = '6rem'
const SUBSTAGE_COLUMN_MIN = '2.25rem'

const stageLabelClass =
  'px-0.5 text-center text-xs font-medium leading-tight text-foreground whitespace-nowrap sm:text-[0.8125rem]'

const substageLabelClass =
  'px-0.5 text-center text-[10px] font-medium leading-tight text-foreground whitespace-nowrap'

type TimelineNode =
  | {
      key: string
      kind: 'stage'
      href: string
      label: string
      status: StageSummaryStatus
      trackAfter: StageSummaryStatus
    }
  | {
      key: string
      kind: 'substage'
      href: string
      label: string
      fullLabel: string
      status: PipelineStepStatus
      trackAfter: PipelineStepStatus
      stageHref: string
      stageId: PipelineStageId
    }

function timelineStepStatus(
  step: PipelineStepState,
  payload: StoryExtractionReviewPayload
): PipelineStepStatus {
  if (step.id === 'relevance-gate') {
    return getQualifyTimelineStatus(payload, step.status)
  }
  return step.status
}

function timelineStepLabel(step: PipelineStepState, payload: StoryExtractionReviewPayload): string {
  if (step.id === 'relevance-gate' && payload.story.relevance_status === 'PENDING') {
    return 'Qualify (Pending)'
  }
  return SUBSTAGE_SHORT_LABEL[step.id] ?? step.label
}

function timelineStepFullLabel(step: PipelineStepState, payload: StoryExtractionReviewPayload): string {
  if (step.id === 'relevance-gate' && payload.story.relevance_status === 'PENDING') {
    return `${step.label} — awaiting Keep or Drop review before scrape`
  }
  return step.label
}

function buildExtractionTimelineNodes(
  stage: StageSummary,
  checklist: ReturnType<typeof derivePipelineChecklist>,
  payload: StoryExtractionReviewPayload
): TimelineNode[] {
  const nodes: TimelineNode[] = []
  const stepById = (id: PipelineStepId) => checklist.steps.find((s) => s.id === id)

  const chunk = stepById('chunk-story-bodies')

  if (chunk) {
    nodes.push({
      key: chunk.id,
      kind: 'substage',
      href: stage.href,
      label: 'Chunk',
      fullLabel: chunk.label,
      status: chunk.status,
      trackAfter: chunk.status,
      stageHref: stage.href,
      stageId: stage.stageId,
    })
  }

  const extractStatus = getExtractTimelineStatus(payload)
  nodes.push({
    key: 'extract-with-review',
    kind: 'substage',
    href: stage.href,
    label: 'Extract',
    fullLabel: extractTimelineDetail(payload),
    status: extractStatus,
    trackAfter: extractStatus,
    stageHref: stage.href,
    stageId: stage.stageId,
  })

  const mergeStatus = getMergeTimelineStatus(payload)
  nodes.push({
    key: 'merge-with-approve',
    kind: 'substage',
    href: stage.href,
    label: 'Merge',
    fullLabel: mergeTimelineDetail(payload),
    status: mergeStatus,
    trackAfter: mergeStatus,
    stageHref: stage.href,
    stageId: stage.stageId,
  })

  return nodes
}

function buildTimelineNodes(
  summaries: StageSummary[],
  checklist: ReturnType<typeof derivePipelineChecklist>,
  payload: StoryExtractionReviewPayload
): TimelineNode[] {
  const nodes: TimelineNode[] = []

  for (const stage of summaries) {
    nodes.push({
      key: stage.stageId,
      kind: 'stage',
      href: stage.href,
      label: stage.label,
      status: stage.status,
      trackAfter: stage.status,
    })

    if (stage.stageId === 'extraction') {
      nodes.push(...buildExtractionTimelineNodes(stage, checklist, payload))
      continue
    }

    const steps = checklist.steps.filter(
      (step) => step.stageId === stage.stageId && !TIMELINE_HIDDEN_STEPS.has(step.id)
    )
    for (const step of steps) {
      const status = timelineStepStatus(step, payload)
      nodes.push({
        key: step.id,
        kind: 'substage',
        href: stage.href,
        label: timelineStepLabel(step, payload),
        fullLabel: timelineStepFullLabel(step, payload),
        status,
        trackAfter: status,
        stageHref: stage.href,
        stageId: stage.stageId,
      })
    }
  }

  return nodes
}

function gridColumnTemplate(nodes: TimelineNode[]): string {
  return nodes
    .map((node) =>
      node.kind === 'substage'
        ? `minmax(${SUBSTAGE_COLUMN_MIN}, max-content)`
        : `minmax(${STAGE_COLUMN_MIN}, max-content)`
    )
    .join(' ')
}

function timelineMinWidth(nodes: TimelineNode[]): string {
  const rem = nodes.reduce(
    (sum, node) => sum + (node.kind === 'substage' ? 2.25 : 6),
    0
  )
  return `${rem}rem`
}

function isStageView(pathname: string, stageHref: string, stageId: string, storyHubHref: string) {
  return pathname === stageHref || (stageId === 'ingestion' && pathname === storyHubHref)
}

function TimelineNodeItem({
  node,
  pathname,
  storyHubHref,
}: {
  node: TimelineNode
  pathname: string
  storyHubHref: string
}) {
  const isSubstage = node.kind === 'substage'
  const active = isSubstage
    ? isStageView(pathname, node.stageHref, node.stageId, storyHubHref) &&
      node.status === 'current'
    : isStageView(pathname, node.href, node.key, storyHubHref)

  const link = (
    <Link
      href={node.href}
      aria-current={active ? 'page' : undefined}
      aria-label={isSubstage ? node.fullLabel : undefined}
      className={cn(
        'z-10 flex flex-col items-center gap-1 px-0.5 text-center transition-opacity',
        isSubstage ? 'min-w-0' : 'shrink-0',
        active ? 'opacity-100' : 'opacity-90 hover:opacity-100'
      )}
    >
      <div className={cn('flex items-center justify-center', TRACK_ROW_HEIGHT)}>
        <PipelineStepNode
          size={isSubstage ? 'substage' : 'stage'}
          status={node.status}
          active={active}
        />
      </div>
      <p className={isSubstage ? substageLabelClass : stageLabelClass}>{node.label}</p>
    </Link>
  )

  if (!isSubstage) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="bottom">{node.fullLabel}</TooltipContent>
    </Tooltip>
  )
}

export function PipelineStepper({
  storyId,
  payload,
}: {
  storyId: string
  payload: StoryExtractionReviewPayload
}) {
  const pathname = usePathname()
  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const summaries = useMemo(() => deriveStageSummaries(storyId, payload), [storyId, payload])
  const nodes = useMemo(
    () => buildTimelineNodes(summaries, checklist, payload),
    [summaries, checklist, payload]
  )
  const storyHubHref = `/admin/stories/${storyId}`

  const trackSegments = nodes.slice(0, -1).map((node) => ({
    key: `${node.key}-segment`,
    after: node.trackAfter,
  }))
  const nodeCount = nodes.length
  const trackInset = `${100 / nodeCount / 2}%`

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Pipeline stages"
        className="w-full overflow-x-auto overflow-y-visible px-0.5 pt-1.5"
      >
        <div className="relative min-w-full pt-0.5" style={{ minWidth: timelineMinWidth(nodes) }}>
          <div
            className="pointer-events-none absolute flex h-0.5 -translate-y-1/2"
            style={{
              top: TRACK_TOP,
              left: trackInset,
              width: `calc(100% - ${100 / nodeCount}%)`,
            }}
            aria-hidden
          >
            {trackSegments.map((segment) => (
              <div
                key={segment.key}
                className={cn('pipeline-step-track', pipelineNodeTrackClass(segment.after))}
              />
            ))}
          </div>

          <div
            className="relative grid w-full items-start"
            style={{ gridTemplateColumns: gridColumnTemplate(nodes) }}
          >
            {nodes.map((node) => (
              <div
                key={node.key}
                className={cn(
                  'flex justify-center',
                  node.kind === 'substage' ? 'min-w-0' : 'shrink-0'
                )}
              >
                <TimelineNodeItem
                  node={node}
                  pathname={pathname}
                  storyHubHref={storyHubHref}
                />
              </div>
            ))}
          </div>
        </div>
      </nav>
    </TooltipProvider>
  )
}
