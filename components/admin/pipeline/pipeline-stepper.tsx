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
// Vertical center of the circle row (half of TRACK_ROW_HEIGHT), measured from the cell top.
const TRACK_LINE_TOP = '0.875rem'

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

// Columns flex to fill the full timeline width; stages get a larger share than substages.
// `max-content` floor guarantees labels never clip; the `fr` ratio keeps stages slightly wider.
const STAGE_COLUMN = 'minmax(max-content, 1.5fr)'
const SUBSTAGE_COLUMN = 'minmax(max-content, 1fr)'

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
    }
  | {
      key: string
      kind: 'substage'
      href: string
      label: string
      fullLabel: string
      status: PipelineStepStatus
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
        stageHref: stage.href,
        stageId: stage.stageId,
      })
    }
  }

  return nodes
}

function gridColumnTemplate(nodes: TimelineNode[]): string {
  return nodes
    .map((node) => (node.kind === 'substage' ? SUBSTAGE_COLUMN : STAGE_COLUMN))
    .join(' ')
}

function timelineMinWidth(nodes: TimelineNode[]): string {
  const rem = nodes.reduce(
    (sum, node) => sum + (node.kind === 'substage' ? 2.25 : 6),
    0
  )
  return `${rem}rem`
}

function getProgressEndIndex(nodes: TimelineNode[]): number {
  let end = -1

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (node.kind === 'stage') {
      // Macro stage `current` is omitted — active work is reflected by substages only.
      if (node.status === 'complete' || node.status === 'blocked') {
        end = i
      }
      continue
    }

    if (
      node.status === 'complete' ||
      node.status === 'optional' ||
      node.status === 'blocked' ||
      node.status === 'current'
    ) {
      end = i
    }
  }

  return end
}

function isTrackSegmentFilled(segmentIndex: number, progressEndIndex: number): boolean {
  return segmentIndex + 1 <= progressEndIndex
}

function isStageView(pathname: string, stageHref: string, stageId: string, storyHubHref: string) {
  return pathname === stageHref || (stageId === 'ingestion' && pathname === storyHubHref)
}

function trackSegmentClass(filled: boolean): string {
  return pipelineNodeTrackClass(filled ? 'complete' : 'pending')
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
        'z-10 flex flex-col items-center gap-1 px-0.5 text-center',
        isSubstage ? 'min-w-0' : 'shrink-0'
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

  const progressEndIndex = useMemo(() => getProgressEndIndex(nodes), [nodes])
  const lastIndex = nodes.length - 1

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Pipeline stages"
        className="w-full overflow-x-auto overflow-y-visible px-0.5 pt-1.5"
      >
        <div className="relative min-w-full pt-0.5" style={{ minWidth: timelineMinWidth(nodes) }}>
          <div
            className="relative grid w-full items-start"
            style={{ gridTemplateColumns: gridColumnTemplate(nodes) }}
          >
            {nodes.map((node, index) => {
              const leftFilled = index > 0 && isTrackSegmentFilled(index - 1, progressEndIndex)
              const rightFilled =
                index < lastIndex && isTrackSegmentFilled(index, progressEndIndex)

              return (
                <div key={node.key} className="relative flex min-w-0 justify-center">
                  {index > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute left-0 right-1/2 h-0.5 -translate-y-1/2',
                        trackSegmentClass(leftFilled)
                      )}
                      style={{ top: TRACK_LINE_TOP }}
                    />
                  )}
                  {index < lastIndex && (
                    <span
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute left-1/2 right-0 h-0.5 -translate-y-1/2',
                        trackSegmentClass(rightFilled)
                      )}
                      style={{ top: TRACK_LINE_TOP }}
                    />
                  )}
                  <TimelineNodeItem
                    node={node}
                    pathname={pathname}
                    storyHubHref={storyHubHref}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </nav>
    </TooltipProvider>
  )
}
